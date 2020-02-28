//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const path = require('path'),
      http = require('http'),
      WebSocket = require('ws'),
      { Messanger } = require('../server/ws-message'),
      { getLogger } = require('../lib/logger'),

      debug   = getLogger.debug({prefix: '\u001b[34mC:d', postfix: '\u001b[0m\n'}),
      info    = getLogger.info({prefix: '\u001b[34mC:i', postfix: '\u001b[0m\n'}),
      warning = getLogger.info({prefix: '\u001b[35mC:i', postfix: '\u001b[0m\n'}),
      error   = getLogger.error({prefix: '\u001b[31mC:!', postfix: '\u001b[0m\n'});

class RequestForwarder extends Object {

  constructor(ws, forward_base_uri) {
    super();
    this.__http = http; // entry point for code injection
    this.maxChannelLivespan = 30000;  // in milliseconds FIXME: configuration should live in config file
    if (!forward_base_uri) throw new Error("Missing the base uri to forward to.");
    let parsed_uri = new URL(forward_base_uri);
    if (parsed_uri.search) throw new Error("Search path is not implemented yet for forward base uri.");
    if (!parsed_uri.protocol.match(/^https?:$/i)) throw new Error(`Only HTTP(s) protocol is implemented for forward base uri (got ${parsed_uri.protocol}).`);
    debug(forward_base_uri);
    this._forward_base_uri = parsed_uri;
    this._ws = ws;
    this._activeChannels = {};
  }

  handle_request(message) {
    const eventId = message.event,
          channelId = message.channel;

    switch(eventId) {
      case 'headers':
        this._registerChannel(
          new Channel(channelId, this, (channel)=> {
            this._destroyChannel(channel);
          }).onHeader(message)
        );
        break;
      case 'data':
        this._activeChannels[channelId].onData(message);
        break;
      case 'end':
        this._activeChannels[channelId].onEnd(message);
        break;
      default:
        throw new Error(`Invalid message event ${eventId}.`);
    }
  }

  _registerChannel(channel) {
    this._activeChannels[channel.id] = channel;
    channel.destructorCallack
  }


  _destroyChannel(channelUrl) {
    if (this._activeChannels[channelUrl]) {
      debug(`destroying channel ${channelUrl}`);
      delete this._activeChannels[channelUrl];
      return true;
    } else {
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
  constructor(id, handler, destructorCallack) {
    super()
    this.id = id;
    this.forwardTo = handler._forward_base_uri.toString();
    this.http = handler.__http;
    this.ws = handler._ws;
    this.destructorCallack = destructorCallack;


    this.timeout = handler.maxChannelLivespan;
    this._timeoutTimer = setTimeout(() => {
      this.request.emit('error', 'The request timed out.');
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

    if (event == 'end' || event == 'error') {
      this.destructor();
    }
    this.ws.send(this.id, event, data);
  }

  onMessage(message) {
    const event = message.event;
    if (this[event]) {
      this[event](message);
    } else {
      error(`Invalid event received for url ${this.url}, channel ${this.id}.`);
    }
    return this;
  }

  onHeader(message) {
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
    this.request.on('error', this.onHttpError.bind(this));
    return this;
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

  onData(message) {
    debug(`  :> data`);
    this.request.write(message.data);
  }

  onEnd() {
    debug(` :> ${this.id} end`);
    this.request.end();
  }

  destructor() {
    // TODO: cleanup
    clearTimeout(this._timeoutTimer);
    if (this.destructorCallack) this.destructorCallack(this);
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
      throw new Error('Attemt to open connection while there is active socket already.');
    }
    this.ws_ = new this.__web_socket(`${wsServer}${websocketPath}/${this.key}`);
    const ws = new Messanger(this.ws_);

    ws.on('open', () => {
      const requestForwarder = new RequestForwarder(ws, forwardTo);
      requestForwarder.__http = this.__http;
      requestForwarder.maxChannelLivespan = requestTimeout;
      info("Client connection openned.");

      ws.send('/', 'test', {data:"Hallo."});
      ws.on("message", requestForwarder.on_message.bind(requestForwarder));
      ws.on("close", function onClose() {
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
      warning(`Attempt to close connection while there is no active socket yet.`);
    }
  }
}

exports.WebSockProxyClient = WebSockProxyClient
