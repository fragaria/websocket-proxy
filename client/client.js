//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const path = require('path');
const http = require('http');
const checksum = require('../lib').checksum;
const WebSocket = require('ws');
const WsJsonProtocol = require('../lib/ws-json');


class RequestForwarder extends Object {
  constructor(ws, forward_base_uri) {
    super();
    this.maxChannelLivespan = 5000;  // in milliseconds
    if (!forward_base_uri) throw new Error("Missing the base uri to forward to.");
    let parsed_uri = new URL(forward_base_uri);
    if (parsed_uri.search) throw new Error("Search path is not implemented yet for forward base uri.");
    if (!parsed_uri.protocol.match(/^https?:$/i)) throw new Error(`Only HTTP(s) protocol is implemented for forward base uri (got ${parsed_uri.protocol}).`);
      console.log(forward_base_uri);
    this._forward_base_uri = parsed_uri;
    this._ws = ws;
    this._activeChannels = {};
  }

  handle_request(message) {
    const eventId = message.event;
    let req;
    switch(eventId) {
      case 'headers':
        const ireq = message.data;
        console.log(`< ${message.channel}:  ${ireq.method} ${ireq.url}`);
        let oreq_uri = new URL(this._forward_base_uri.toString()); // clone the original uri
        oreq_uri.href = path.posix.join(oreq_uri.href, ireq.url);
        const req_params = {
          method: ireq.method,
          headers: ireq.headers,
        }
        let _send = this._send.bind(this);
        let sender = function sender(event_id) {
          return function (data) {
            if (event_id == 'data') {
              console.log(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname} ${data.length} ${checksum(data)}`);
            } else {
              console.log(`<:  ${message.channel}:  ${event_id} ${ireq.method} ${oreq_uri.pathname}`);
            }
            _send({
              channel: message.channel,
              id: message.id,
              event: event_id,
              data: data,
            })
          }
        }
        console.log(` :> ${message.channel}:  ${ireq.method} ${oreq_uri.toString()}`);
        req = http.request(oreq_uri.toString(), req_params, function handleResponse(res) {
          // res.setEncoding('utf8');
          console.log(`<:  ${message.channel}:  ${res.statusCode} ${res.statusMessage} / ${ireq.method} ${oreq_uri.pathname}`);
          sender('headers')({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
          });
          res.on('data', sender('data'));
          res.on('end', sender('end'));
        });
        req.on('error', sender('error'));
        this._registerChannel(message.channel, req);
        break;
      case 'data':
        req = this._activeChannels[message.channel];
        if (req) {
            try {
                if (message.data instanceof Object) {
                    message.data = Buffer.from(message.data);
                }
                console.log(`  :> ${digest(message.data)}]`);
                req.write(message.data);
            } catch(err) {
                console.log('data is object', message);
                throw err;
            }
        } else {
            console.error(`Channel ${message.channel} not found. Did it expire?`);
        }
        break;
      case 'end':
        req = this._activeChannels[message.channel];
        if (req) {
            req.end();
            this._destroyChannel(message.channel);
        } else {
            console.error(`Channel ${message.channel} not found. Did it expire?`);
        }
        break;
      default:
        throw new Error(`Invalid message event ${eventId}.`);
    }
  }

  _registerChannel(channelUrl, request) {
    this._activeChannels[channelUrl] = request;
    let self=this;
    setTimeout(()=>self._destroyChannel(channelUrl), this.maxChannelLivespan);
  }

  _destroyChannel(channelUrl) {
      if (this._activeChannels[channelUrl]) delete this._activeChannels[channelUrl];
  }

  _send(data) {
    this._ws.send(data);
  }

  on_message(message) {
    if (!message.channel || message.channel.indexOf('/req/') != 0) {
      return;
    } else {
      this.handle_request(message);
    }
  }
}

class WebSockProxyClient extends Object {

    constructor(client_key) {
        super();
        this.key = client_key;
    }

    connect(host_port, {forward_to = 'http://localhost', websocket_path = '/ws'}={}) {
        const ws_ = new WebSocket(`ws://${host_port}${websocket_path}/${this.key}`);
        const ws = new WsJsonProtocol(ws_);

        ws.on('open', function open() {
          const request_forwarder = new RequestForwarder(ws, forward_to);
          console.log("Client connection openned.");

          ws.send({data:"Hallo."});
          ws.on("message", function (message) {
            request_forwarder.on_message(message);
          });
          ws.on("close", function onClose() {
            console.log("Client connection closed.");
          });
        });
        return ws;
    }
}

exports.WebSockProxyClient = WebSockProxyClient
