//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const path = require('path');
const http = require('http');
const { checksum } = require('../lib');
const WebSocket = require('ws');
const { Messanger } = require('../server/ws-message');
const { getLogger } = require('../lib/logger');


const debug   = getLogger.debug({prefix: '\u001b[34mC:d', postfix: '\u001b[0m\n'}),
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
    this.state = ['> headers', '-'];
  }

  setState(ws, http) {
    if (ws) this.state[0] = ws;
    if (http) this.state[1] = http;
  }

  testResponse(message) {
    this._send({
      channel: message.channel,
      event: 'headers',
      data: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {'content-type': 'text/plain; charset=utf-8'},
      }
    });
    this._send({
      channel: message.channel,
      event: 'data',
      data: new Buffer.from('Pong'),
    });
    this._send({
      channel: message.channel,
      event: 'end',
    });
  }

  handle_request(message) {
    const self = this;
    const eventId = message.event;
    let req;
    switch(eventId) {
      case 'headers':
        this.setState('> headers');
        const ireq = message.data;
        if (ireq.url == '/__ws_proxy_test__') {
          return this.testResponse(message);
        }
        debug(`< ${message.channel}:  ${ireq.method} ${ireq.url}`);
        let oreq_uri = new URL(this._forward_base_uri.toString()); // clone the original uri
        oreq_uri.href = path.posix.join(oreq_uri.href, ireq.url);
        const req_params = {
          method: ireq.method,
          headers: ireq.headers,
          search: ireq.search,
        }
        let _send = this._send.bind(this);
        let sender = function sender(event_id) {
          return function (data) {
            if (event_id == 'data') {
              debug(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname} ${data.length}`);
            } else if (event_id == 'error') {
              info(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname}`);
            } else {
              debug(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname}`);
            }

            if (event_id == 'end' || event_id == 'error') {
              self._destroyChannel(message.channel);
            }

            self.setState('< ' + event_id);
            _send({
              channel: message.channel,
              event: event_id,
              data: data,
            })
          }
        }
        info(` > ${message.channel}:  ${ireq.method} ${ireq.url} -> ${oreq_uri.toString()}`);
        this.setState('> headers', '> headers ');
        let reqTimeout;
        req = this.__http.request(oreq_uri.toString(), req_params, function handleResponse(res) {
          // res.setEncoding('utf8');
          self.setState(null, '< headers ');
          debug(`<:  ${message.channel}:  ${res.statusCode} ${res.statusMessage} / ${ireq.method} ${oreq_uri.pathname}`);
          sender('headers')({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
          });
          res.on('data', sender('data'));
          res.on('end', ()=> {
            sender('end')();
            clearTimeout(reqTimeout);
          });
        });
        this._registerChannel(message.channel, req);
        req.on('error', sender('error'));
        reqTimeout = setTimeout(() => {
          req.emit('error', 'The request timed out.');
        }, this.maxChannelLivespan);
        break;
      case 'data':
        this.setState('> data');
        req = this._activeChannels[message.channel];
        if (req) {
            debug(`  :> data`);
            req.write(message.data);
        } else {
            error(`Channel ${message.channel} not found. Did it expire (on data sent)?`);
        }
        break;
      case 'end':
        debug(` :> ${message.channel} end`);
        this.setState('> end');
        req = this._activeChannels[message.channel];
        if (req) {
            req.end();
            this._destroyChannel(message.channel);
        } else {
            error(`Channel ${message.channel} not found. Did it expire (on response end)?`);
        }
        break;
      default:
        throw new Error(`Invalid message event ${eventId}.`);
    }
  }

  _registerChannel(channelUrl, request) {
    this._activeChannels[channelUrl] = request;
    let self=this;
    setTimeout(()=>self._onChannelTimeout(channelUrl), this.maxChannelLivespan+10);
  }

  _onChannelTimeout(channelUrl) {
    if (this._destroyChannel(channelUrl)) {
      // channel exists aftert timeout
      info(`Connection timeout ${channelUrl}`);
      this._send({
        channel: channelUrl,
        event: 'error',
        data: 'Connection timeout',
      });
    }
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

  _send(data) {
    this._ws.send(data.channel, data.event, data.data);
  }

  on_message(message) {
    if (message.channel && message.channel.indexOf('/req/') == 0) {
      this.handle_request(message);
    }
  }
}

exports.RequestForwarder = RequestForwarder;


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
    }={}) {
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
