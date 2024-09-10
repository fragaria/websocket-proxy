//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const { setInterval } = require('timers');

let IS_DOWNLOAD_UPLOAD_RUNNING = false;

const path = require('path'),
      os = require('os'),
      http = require('http'),
      https = require('https'),
      fs = require('fs'),
      FormData = require('form-data'),
      WebSocket = require('ws'),
      { Messanger } = require('../server/ws-message'),
      { getLogger } = require('../lib/logger'),
      { getIPAddress } = require('../lib/utils'),
      config = require('../config'),

      debug   = getLogger.debug({prefix: '\u001b[34mC:d', postfix: '\u001b[0m\n'}),
      info    = getLogger.info({prefix: '\u001b[34mC:i', postfix: '\u001b[0m\n'}),
      warning = getLogger.warning({prefix: '\u001b[35mC:i', postfix: '\u001b[0m\n'});

class InvalidRequestError extends Error { }  // Received an invalid request from proxy server side

class RequestForwarder extends Object {

  constructor(ws, forwardBaseUri) {
    super();
    if (!forwardBaseUri) throw new Error("Missing the base uri to forward to.");
    const parsedUrl = new URL(forwardBaseUri);
    if (parsedUrl.search) throw new Error("Search path is not implemented yet for forward base uri.");
    if (!parsedUrl.protocol.match(/^https?:$/i)) throw new Error(`Only HTTP(s) protocol is implemented for forward base uri (got ${parsedUrl.protocol}).`);

    this.maxChannelLivespan = 30000;  // in milliseconds FIXME: configuration should live in config file
    this._forward_base_uri = parsedUrl;
    /** @type {Object.<string, Channel>} */
    this._activeChannels = {};
    /** @type {WebSocket} */
    this._ws = ws;
    /** @type {http} */
    this.__http = http; // entry point for code injection
  }

  handle_request(message) {
    const channelId = message.channel;

    let channel;
    if (!this._activeChannels[channelId]) {
      channel = new Channel(channelId, this, (channel)=> {
        this._destroyChannel(channel);
      });
      this._registerChannel(channel);
    } else {
      channel = this._activeChannels[channelId];
    }
    channel.onMessage(message);
  }

  /** @param {Channel} channel */
  _registerChannel(channel) {
    this._activeChannels[channel.id] = channel;
  }

  /** @param {Channel} channel */
  _destroyChannel(channel) {
    if (this._activeChannels[channel.id]) {
      debug(`destroying channel ${channel.id}`);
      delete this._activeChannels[channel.id];
      return true;
    } else {
      warning('Attempt to destroy channel which does not exist.');
      return false;
    }
  }

  on_message(message) {
    if (message.channel && message.channel.indexOf('/req/') == 0) {
      this.handle_request(message);
    }
  }
}

exports.RequestForwarder = RequestForwarder;

class Channel extends Object {
  /**
   * @callback DestructorCallback
   * @param {Channel} channel
   */
  /**
   * @param {string} id
   * @param {RequestForwarder} handler
   * @param {DestructorCallback} destructorCallack
   */
  constructor(id, handler, destructorCallack) {
    super()
    this.id = id;
    this.forwardTo = handler._forward_base_uri.toString();
    this.http = handler.__http;
    this.ws = handler._ws;
    this.destructorCallack = destructorCallack;

    this.timeout = handler.maxChannelLivespan;

    this._timeoutTimer = new Timer(() => {
      if (this.request && this.request.emit) {
        this.request.emit('error', 'The request timed out.');
      }
    }, this.timeout);
  }

  _send(event, data) {
    if (event == 'data') {
      debug(`<:  ${this.id}:  ${event} ${this.id} ${this.url} ${data.length}`);
    } else if (event == 'error') {
      info(`<:  ${this.id}:  ${event} ${this.id} ${this.url}`);
    } else {
      debug(`<:  ${this.id}:  ${event} ${this.id} ${this.url}`);
    }

    this.ws.send(this.id, event, data);
  }

  onMessage(message) {
    const event = message.event;
    const eventHandler = `on_${event}`;
    if (this[eventHandler]) {
      try {
        this[eventHandler](message);
      } catch(error) {
        if (error instanceof InvalidRequestError) {
          this.on_error(error.message);
        } else {
          throw error;
        }
      }
    } else {
      this.on_error(`Invalid event ${event} received for url ${this.url}, channel ${this.id}.`);
    }
    return this;
  }

  /**
   * Internal (not forwarded api endpoint on /$ip
   */
  internal_request_ip(ireq, forwardToUrl) {
    this._send('headers', {
      statusCode: '200',
      statusMessage: 'OK',
      headers: {'Content-Type': 'application/json; charset=utf-8'},
    });
    this.url = ireq.url;
    this.request = {end: ()=>{

      let ipAddress;
      if (['localhost', '127.0.0.1',].indexOf(forwardToUrl.hostname) >= 0) {
        ipAddress = getIPAddress();
      } else {
        ipAddress = forwardToUrl.hostname;
      }
      this.onHttpData(JSON.stringify({
        'ipAddress': ipAddress,
      }));
      this.onHttpEnd();
    }};
  }

  internal_request_download_upload_file(forwardToUrl) {
    if (IS_DOWNLOAD_UPLOAD_RUNNING) {
      this.request = {
        write: () => {},
        end: () => {
          this._send('headers', {
            statusCode: '503',
            statusMessage: `Previous request is still processing.`
          });
          this.onHttpEnd();
        }
      };
    } else {

      IS_DOWNLOAD_UPLOAD_RUNNING = true;

      this.request = {
        write: (data) => {
          // parse received formdata to object/json
          const jsonData = Object.fromEntries(new URLSearchParams(data).entries());

          const tempFilePath = path.join(os.tmpdir(), jsonData.upload_file_name);

          const adapter = new URL(jsonData.download_url).protocol == 'https:' ? https : http;

          adapter.get(jsonData.download_url, (response) => {
            if (response.statusCode !== 200) {
              this._send('headers', {
                statusCode: '400',
                statusMessage: `Error downloading remote file. Remote server responded with unexpected HTTP status: ${response.statusCode} ${response.statusMessage}.`
              });
              this.onHttpEnd();
              IS_DOWNLOAD_UPLOAD_RUNNING = false;
            } else {
              const tmpFile = fs.createWriteStream(tempFilePath);
              response.pipe(tmpFile);

              tmpFile.on('finish', () => {
                tmpFile.close();

                const form = new FormData();
                form.append('file', fs.createReadStream(tempFilePath));

                // add/pass any additional formdata to forwarded formdata;
                // skip specific data we used for download/upload file that should not be forwarded
                for (const property in jsonData) {
                  if (! ['download_url', 'upload_url', 'upload_file_name'].includes(property)) {
                    form.append(property, jsonData[property]);
                  }
                }

                const options = {
                  method: 'POST',
                  headers: form.getHeaders(),
                };

                const uploadUrl = new URL(jsonData.upload_url, forwardToUrl.toString()).toString();

                const req = http.request(uploadUrl, options, (res) => {
                  if (res.statusCode != 200 && res.statusCode != 201) {
                    this._send('headers', {
                      statusCode: '400',
                      statusMessage: `Error uploading file. Server responded with unexpected HTTP status: ${res.statusCode} ${res.statusMessage}.`
                    });
                    this.onHttpEnd();
                    IS_DOWNLOAD_UPLOAD_RUNNING = false;
                  } else {
                    this._send('headers', {
                      statusCode: res.statusCode,
                      statusMessage: res.statusMessage,
                      headers: res.headers,
                    });
                    res.on('data', (chunk) => {
                      this.onHttpData(chunk);
                    });
                    res.on('end', () => {
                      IS_DOWNLOAD_UPLOAD_RUNNING = false;
                      this.onHttpEnd();
                    });
                  }
                });
                req.on('error', (err) => {
                  throw err;
                });
                form.pipe(req);
              });
            }
          });
        },
        end: () => {}
      };
    }
  }

  standardForwardedRequest(inReq, forwardToUrl) {
    forwardToUrl.href = path.posix.join(forwardToUrl.href, inReq.url);
    // TODO: Port setup should be packed in message on WS server part
    if (inReq.headers['x-karmen-port']) {
      let port = inReq.headers['x-karmen-port'].trim();
      if (port && port != 'None') {  // FIXME: hack - old version of Karmen server sends 'None' as port
        if (config.client.allowedForwardToPorts.indexOf(port) < 0) {
          debug(`! ${this.id}:  ${inReq.method} ${inReq.url} - prohibited port`);
          throw new InvalidRequestError(`Port ${port} is not allowed on the device.`);
        }
        forwardToUrl.port = port;
        delete inReq.headers['x-karmen-port'];
      }
    }
    const requestParameters = {
      method: inReq.method,
      headers: inReq.headers,
      search: inReq.search,
    }
    if (requestParameters.headers.host) {
      delete requestParameters.headers.host;
    }
    info(` > ${this.id}:  ${inReq.method} ${inReq.url} -> ${forwardToUrl.toString()}`);
    this.url = forwardToUrl.toString();
    this.request = this.http.request(this.url, requestParameters, (res) => {
      // res.setEncoding('utf8');
      debug(`<:  ${this.id}:  ${res.statusCode} ${res.statusMessage} / ${inReq.method} ${forwardToUrl.pathname}`);
      this._send('headers', {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
      });
      this._timeoutTimer.reset();
      res.on('data', this.onHttpData.bind(this));
      res.on('end', this.onHttpEnd.bind(this));
    });
    this.request.on('error', this.onHttpError.bind(this));
    return this;
  }

  on_headers(message) {
    this._timeoutTimer.reset()
    const incomingRequest = message.data;
    debug(`< ${this.id}:  ${incomingRequest.method} ${incomingRequest.url}`);
    const forwardToUrl = new URL(this.forwardTo); // clone the original uri

    // special internal API endpoint to get local IP address of the device
    if (incomingRequest.url.startsWith('/$ip')) {
      return this.internal_request_ip(incomingRequest, forwardToUrl);

    // special internal API endpoint to download file from remote and re-post it
    } else if (incomingRequest.url.startsWith('/$download_upload_file')) {
      return this.internal_request_download_upload_file(forwardToUrl);

    // any other standard request to be forwarded
    } else {
      return this.standardForwardedRequest(incomingRequest, forwardToUrl);
    }
  }

  on_data(message) {
    debug(`  :> ${this.id} data`);
    this._timeoutTimer.reset();
    this.request.write(message.data);
  }

  on_end() {
    debug(` :> ${this.id} end`);
    if (this.request) {
      this.request.end();
    } else {
      warning(`Received end before I was able to create a request.`);
      setTimeout(()=>console.log(`Request: ${this.request}`), 100);
    }
  }

  onHttpData(chunk) {
    this._timeoutTimer.reset();
    this._send('data', chunk);
  }

  onHttpEnd() {
    this._send('end');
    this.destructor();
  }

  on_error(error) {
    console.log(error);
    this._send('error', error);
    this.on_end();
    this.destructor();
  }

  onHttpError(error) {
    console.log(error);
    this._send('error', error);
    this.destructor();
  }

  destructor() {
    // TODO: cleanup
    this._timeoutTimer.cancel()
    this.destructorCallack(this);
  }

}


/**
 * Plays ping-pong with server. When server stops playing throws an error.
 * This allows client to restart when connection with server is closed without
 * knowing.
 */
class PingPongGamer extends Object {

  /**
   * @param {Messanger} ws
   */
  constructor(ws) {
    super();
    this.pingInterval = config.keepAlivePingInterval * 1000;
    this.ws = ws;
    this.gotMessage = true;
    this.timers = setInterval(() => {this.ping();}, this.pingInterval);
    debug('Starting ping-pong.');
  }

  onMessage(message) {
    // record that server was life (even for non-pong messages)
    this.gotMessage = true;
    if (message.event == 'ping') {
      this.ws.send(message.channel, 'pong');
    }
  }

  ping() {
    if (!this.gotMessage) {
      throw Error("Did not received pong after last ping.");
    }
    debug('Ping');
    this.ws.send('ping-pong', 'ping');
    this.gotMessage = false;
  }

}


class WebSockProxyClient extends Object {

  constructor(client_key) {
    super();
    this.key = client_key;

    // entry point for code injection
    this.__web_socket = WebSocket;
    this.__http = http;
  }

  connect(wsServer, {
    forwardTo='http://localhost',
    websocketPath='/ws',
    requestTimeout=5000,
  }) {
    if (this.ws_) {
      throw new Error('The client is already connected.');
    }
    /** @type WebSocket */
    this.ws_ = new this.__web_socket(`${wsServer}${websocketPath}/${this.key}`);
    /** @type WebSocket */
    const ws = new Messanger(this.ws_);
    this.ws = ws;

    ws.on('open', () => {
      const requestForwarder = new RequestForwarder(ws, forwardTo);
      requestForwarder.__http = this.__http;
      requestForwarder.maxChannelLivespan = requestTimeout;
      info("Client connection openned.");
      let pingPong = new PingPongGamer(ws);

      ws.on("message", pingPong.onMessage.bind(pingPong));
      ws.on("message", requestForwarder.on_message.bind(requestForwarder));
      this.ws_.on("close", function onClose() {
        info("Server connection closed.");
      });
    });
    return ws;
  }

  close() {
    if (this.ws_) {
      delete(this.ws_);
    } else {
      throw new Error('Client is not connected.');
    }
  }
}

class Timer extends Object {
  constructor(callback, duration) {
    super();
    this.callback = callback;
    this.duration = duration;
    this.reset(callback, duration);
  }

  reset() {
    this.cancel();
    this._timer = setTimeout(this.callback, this.duration);
  }

  cancel() {
    clearTimeout(this._timer);
  }
}

exports.WebSockProxyClient = WebSockProxyClient
