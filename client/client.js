//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const path = require('path'),
      http = require('http'),
      WebSocket = require('ws'),
      { Messanger } = require('../server/ws-message'),
      { getLogger } = require('../lib/logger'),

      debug   = getLogger.debug({prefix: '\u001b[34mC:d', postfix: '\u001b[0m\n'}),
      info    = getLogger.info({prefix: '\u001b[34mC:i', postfix: '\u001b[0m\n'}),
      warning = getLogger.info({prefix: '\u001b[35mC:i', postfix: '\u001b[0m\n'});

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
      this[eventHandler](message);
    } else {
      throw new Error(`Invalid event ${event} received for url ${this.url}, channel ${this.id}.`);
    }
    return this;
  }

  on_headers(message) {
    const ireq = message.data;
    debug(`< ${this.id}:  ${ireq.method} ${ireq.url}`);
    const forwardToUrl = new URL(this.forwardTo); // clone the original uri
    forwardToUrl.href = path.posix.join(forwardToUrl.href, ireq.url);
    const requestParameters = {
      method: ireq.method,
      headers: ireq.headers,
      search: ireq.search,
    }
    info(` > ${this.id}:  ${ireq.method} ${ireq.url} -> ${forwardToUrl.toString()}`);
    this.url = forwardToUrl.toString();
    this.request = this.http.request(this.url, requestParameters, (res) => {
      // res.setEncoding('utf8');
      debug(`<:  ${this.id}:  ${res.statusCode} ${res.statusMessage} / ${ireq.method} ${forwardToUrl.pathname}`);
      this._send('headers', {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
      });
      res.on('data', this.onHttpData.bind(this));
      res.on('end', this.onHttpEnd.bind(this));
    });
    this._timeoutTimer = setTimeout(() => {
      this.request.emit('error', 'The request timed out.');
    }, this.timeout);
    this.request.on('error', this.onHttpError.bind(this));
    return this;
  }

  on_data(message) {
    debug(`  :> data`);
    this.request.write(message.data);
  }

  on_end() {
    debug(` :> ${this.id} end`);
    this.request.end();
  }

  onHttpData(chunk) {
    this._send('data', chunk);
  }

  onHttpEnd() {
    this._send('end');
    this.destructor();
  }

  onHttpError(error) {
    this._send('error', error);
    this.destructor();
  }

  destructor() {
    // TODO: cleanup
    clearTimeout(this._timeoutTimer);
    this.destructorCallack(this);
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

    ws.on('open', () => {
      const requestForwarder = new RequestForwarder(ws, forwardTo);
      requestForwarder.__http = this.__http;
      requestForwarder.maxChannelLivespan = requestTimeout;
      info("Client connection openned.");

      ws.on("message", requestForwarder.on_message.bind(requestForwarder));
      this.ws_.on("close", function onClose() {
        info("Server connection closed.");
      });
    });
    return ws;
  }

  close() {
    if (this.ws_) {
      this.ws_.close();
      delete(this.ws_);
    } else {
      throw new Error('Client is not connected.');
    }
  }
}

exports.WebSockProxyClient = WebSockProxyClient
