'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const http = require('http');
const WebSocket = require('ws');
const ws = new WebSocket(`ws://localhost:8080/ws/pill/${process.argv[2]}`);
const forward_host = process.argv[3];
const forward_port = process.argv[4];

class RequestForwarder extends Object {
  constructor(ws, host, port) {
    super();
    if (!host || !port) throw new Error("Host and port are required arguments.");
    this._forward_host = host;
    this._forward_port = port;
    this._ws = ws;
  }

  fire_request(message, ) {
    const ireq = message.request;
    const req_params = {
      host: this._forward_host,
      port: this._forward_port,
      path: ireq.url,
      method: ireq.method,
      headers: ireq.headers,
    }
    let _send = this._send.bind(this);
    let sender = function sender(event_id) {
      return function (data) {
        _send({
          channel: message.channel,
          id: message.id,
          event: event_id,
          data: data,
        })
      }
    }
    const req = http.request(req_params, function handleResponse(res) {
      res.setEncoding('utf8');
      sender('headers')({
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
      });
      res.on('data', sender('data'));
      res.on('end', sender('end'));
    });
    req.on('error', sender('error'));
    if (ireq.body) {
      console.log(`Sending body ${ireq.body}`);
      req.write(ireq.body);
    }
    req.end();
    console.log(`End of request ${message.channel}`);
  }

  _send(data) {
    let message = JSON.stringify(data, undefined, 3);
    console.log(`Sending ${message}`)
    this._ws.send(message);
  }

  on_message(message) {
    if (!message.channel || message.channel.indexOf('/req/') != 0) return;
    else this.fire_request(message);
  }
}


ws.on('open', function open() {
  const request_forwarder = new RequestForwarder(ws, forward_host, forward_port);
  console.log("Client connection openned.");

  ws.send(JSON.stringify({data:"Hallo."}));
  ws.on("message", function (message) {
    console.log(`Got message\n------\n${message}\n------\n\n`);
    let data;
    try {
      data = JSON.parse(message);
    } catch(err) {
      console.error(err);
      return;
    }
    request_forwarder.on_message(data);
  });
});
