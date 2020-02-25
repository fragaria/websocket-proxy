//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const path = require('path');
const http = require('http');
const { checksum } = require('../lib');
const statusBar = new (require('../lib/utils').ConsoleStatusBar)(1, 1, 100);
const WebSocket = require('ws');
const WsJsonProtocol = require('../lib/ws-json');
const { BufferStruct, BufferStructType } = require('../lib/buffer-struct');
const { Messanger } = require('../server/ws-message');
const { getLogger } = require('../lib/logger');

const debug = getLogger.debug({prefix: '\u001b[34mC:d', postfix: '\u001b[0m\n'}),
      info = getLogger.info({prefix: '\u001b[34mC:i', postfix: '\u001b[0m\n'});

class RequestForwarder extends Object {
  constructor(ws, forward_base_uri) {
    super();
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
    // statusBar.write(`${this.state[0]} | ${this.state[1]} ${this.parsed_uri}`);
  }

  handle_request(message) {
    const self = this;
    const eventId = message.event;
    let req;
    switch(eventId) {
      case 'headers':
        this.setState('> headers');
        const ireq = message.data;
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
            } else {
              debug(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname}`);
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
        req = http.request(oreq_uri.toString(), req_params, function handleResponse(res) {
          // res.setEncoding('utf8');
          self.setState(null, '< headers ');
          debug(`<:  ${message.channel}:  ${res.statusCode} ${res.statusMessage} / ${ireq.method} ${oreq_uri.pathname}`);
          sender('headers')({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
          });
          res.on('data', sender('data'));
          res.on('end', () => {
            sender('end')();
            self._destroyChannel(message.channel);
          });
        });
        this._registerChannel(message.channel, req);
        req.on('error', sender('error'));
        break;
      case 'data':
        this.setState('> data');
        req = this._activeChannels[message.channel];
        if (req) {
            try {
                debug(`  :> `);
                req.write(message.data);
            } catch(err) {
                throw err;
            }
        } else {
            console.error(`Channel ${message.channel} not found. Did it expire (on data sent)?`);
        }
        break;
      case 'end':
        this.setState('> end');
        req = this._activeChannels[message.channel];
        if (req) {
            req.end();
            this._destroyChannel(message.channel);
        } else {
            console.error(`Channel ${message.channel} not found. Did it expire (on response end)?`);
        }
        break;
      default:
        throw new Error(`Invalid message event ${eventId}.`);
    }
  }

  _registerChannel(channelUrl, request) {
    this._activeChannels[channelUrl] = request;
    let self=this;
    setTimeout(()=>self._onChannelTimeout(channelUrl), this.maxChannelLivespan);
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
        debug(`del channel ${channelUrl}`);
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
    } else {
    }
  }
}


class WebSockProxyClient extends Object {

  constructor(client_key) {
    super();
    this.key = client_key;
  }

  connect(ws_server, {forward_to = 'http://localhost', websocket_path = '/ws'}={}) {
    const ws_ = new WebSocket(`${ws_server}${websocket_path}/${this.key}`);
    const ws = new Messanger(ws_);

    ws.on('open', function open() {
      const request_forwarder = new RequestForwarder(ws, forward_to);
      info("Client connection openned.");

      ws.send('/', 'test', {data:"Hallo."});
      ws.on("message", request_forwarder.on_message.bind(request_forwarder));
      ws.on("close", function onClose() {
        info("Client connection closed.");
      });
    });
    return ws;
  }
}

exports.WebSockProxyClient = WebSockProxyClient
