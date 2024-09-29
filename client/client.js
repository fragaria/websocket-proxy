//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const { setInterval } = require('timers');

let IS_DOWNLOADING = false;
let DOWNLOAD_PROGRESS = 0;
let DOWNLOAD_PROGRESS_PCT = 0;

const path = require('path'),
      http = require('http'),
      https = require('https'),
      fs = require('fs'),
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
   * Send response, that device is busy by downloading file. Downloading file is problematic
   * for devices like Raspberry or OrangePi, so it's better to refuse all incoming requests.
   */
  sendBusyDownloadResponse() {
    this.request = {
      write: () => {},
      end: () => {
        this._send('headers', {
          statusCode: '503',
          statusMessage: 'Download request is processing.',
          headers: {'download-in-progress-percent': DOWNLOAD_PROGRESS_PCT}
        });
        this.onHttpEnd();
      }
    };
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

  /**
   * Internal request that download file from specified URL and store it locally
   * to specified directory. It should be used, to prevent uploading files
   * through websocket channel which is causing network instability and connection issues.
   */
  internal_request_download_file() {
    IS_DOWNLOADING = true;
    let requestData = null;
    this.request = {
      write: (data) => {
        requestData = data;
      },
      end: () => {
        // if UPLOAD_DIRECTORY (config.client.uploadDirectory) is not defined,
        // then can't continue as it's unknown, where to save downloaded file
        if (! config.client.uploadDirectory) {
          let msg = 'Bad websocket proxy client configuration, UPLOAD_DIRECTORY is undefined.';
          warning(msg);
          this._send('headers', {
            statusCode: '400',
            statusMessage: msg,
            headers: {'Content-Type': 'application/json; charset=utf-8'}
          });
          this.onHttpEnd();
          IS_DOWNLOADING = false;
          return;
        }

        let searchParams = new URLSearchParams(requestData);
        const fileName = searchParams.get('file_name');
        const downloadUrl = searchParams.get('download_url');
        const tempFilePath = path.join(config.client.uploadDirectory, fileName);

        const adapter = new URL(downloadUrl).protocol == 'https:' ? https : http;
        let req = adapter.get(downloadUrl, (response) => {
          if (response.statusCode !== 200) {
            this._send('headers', {
              statusCode: '400',
              statusMessage: `Error downloading remote file. Remote server responded with unexpected HTTP status: ${response.statusCode} ${response.statusMessage}.`,
              headers: {'Content-Type': 'application/json; charset=utf-8'}
            });
            this.onHttpEnd();
            IS_DOWNLOADING = false;
          } else {
            const localFile = fs.createWriteStream(tempFilePath);

            DOWNLOAD_PROGRESS = 0; // reset download progress value

            const size = Number(response.headers['content-length']);
            let previousProgressInfoValue = 0;
            response.on('data', data => {
              this._timeoutTimer.reset()
              DOWNLOAD_PROGRESS += Buffer.byteLength(data);
              DOWNLOAD_PROGRESS_PCT = (DOWNLOAD_PROGRESS / size * 100).toFixed(2);
              if (previousProgressInfoValue < DOWNLOAD_PROGRESS_PCT - 5) { // report progress in 5% intervals to protect system journal/log
                previousProgressInfoValue = DOWNLOAD_PROGRESS_PCT;
                info(`Download progress: ${DOWNLOAD_PROGRESS_PCT}%`);
              }
              localFile.write(data);
            });

            response.on('end', () => {
              this._timeoutTimer.reset()
              localFile.close();
              this._send('headers', {
                statusCode: 200,
                statusMessage: 'OK',
                headers: {'Content-Type': 'application/json; charset=utf-8'}
              });
              this.onHttpData('{"message": "File downloaded."}');
              this.onHttpEnd();
              IS_DOWNLOADING = false;
            });
          }
        });
        req.on('error', (err) => {
          this.onHttpError(err);
          IS_DOWNLOADING = false;
        });
        req.end();
      }
    };
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
    info(`< ${this.id}:  ${incomingRequest.method} ${incomingRequest.url}`);
    const forwardToUrl = new URL(this.forwardTo); // clone the original uri

    // when file is downloading to device, skip processing request and send back "device is busy" response
    if (IS_DOWNLOADING) {
      return this.sendBusyDownloadResponse();

    // special internal API endpoint to get local IP address of the device
    } else if (incomingRequest.url.startsWith('/$ip')) {
      return this.internal_request_ip(incomingRequest, forwardToUrl);

    // special internal API endpoint to download file from remote and re-post it
    } else if (incomingRequest.url.startsWith('/$download_file')) {
      return this.internal_request_download_file();

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
