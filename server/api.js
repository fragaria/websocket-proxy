'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const REQ_SIZE_LIMIT = 1024*1024;
const uuid = require('uuid');
const { HttpError, BadGateway } = require('./HttpError');

class Api extends Object {
  constructor(path_prefix, get_client) {
    console.log(`Starting API with path prefix '${path_prefix}'.`);
    super();
    if (! path_prefix) {
      path_prefix = '/';
    }
    this._path_prefix = path_prefix;
    this._get_client = get_client;
  }

  _parse_request_path(req) {
    let m = req.url.match(new RegExp(`^${this._path_prefix}/(?<id>[^/]*)(?<resource>/.*)$`));
    return m ? m.groups : null; 
  }

  _verify_client_id(client_id) {
  }

  _generate_req_id(req, client_id) {
    return uuid.v4();
  }



  _request_handler(req, res) {
    console.log(`API < ${req.method} ${req.url} ... matching against ${this._path_prefix}`);
    let path_info = this._parse_request_path(req);
    if (!path_info || !path_info.id || ! path_info.resource) {
      console.error(`Invalid url ${req.url}`);
      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      res.write('Not found');
      res.end();
      return;
    }
    let client_id = path_info.id
    let resource_path = path_info.resource;
    let websocket_client = this._get_client(client_id);
    if (! websocket_client) throw new BadGateway();
    const req_id = this._generate_req_id(req, client_id);
    const channel = `/req/${req_id}`;


    let http_response = {}
    websocket_client.on('message', (message) => {
      message = JSON.parse(message);
      if (message.channel && message.channel == channel) {
        switch(message.event) {
          case 'headers':
            console.log(`<:   ${channel}:  ${message.data.statusCode} ${message.data.statusMessage} / ${message.event} ${req.method} ${req.url}`);
            res.writeHead(message.data.statusCode, message.data.statusMessage, message.data.headers);
            break;
          case 'data':
            console.log(`<:   ${channel}:  data ${message.data.length}`);
            res.write(message.data);
            break;
          case 'end':
            console.log(`<:   ${channel}:  end`);
            res.end();
            break;
          case 'error':
            console.log(`<:   ${channel}:  error`);
            res.writeHead(502, "Invalid gateway", {'content-type': 'application/json; charset=utf-8'});
            res.write(JSON.stringify(message.data, undefined, 3));
            res.end();
            break;
          default:
            console.error(`<:  ${channel}:  Unknown message type ${message.event}.`);
            websocket_client.close();
            break;
        }
      }
    });

    let request_data = {};
    ['method', 'headers']
      .forEach((propertyName)=>request_data[propertyName]=req[propertyName]);
    request_data.body = req.body;
    request_data.url = resource_path;
    console.log(` :>  ${channel}:  ${req.method} ${req.url}`);
    websocket_client.send(JSON.stringify({
      channel: channel,
      id: req_id,
      request: request_data, 
    }, undefined, 3));
  }

  get request_handler() {
    return (function (req, res) {
      req.body = '';
        // FIXME: this will not work for bigger request body. the stream needs to be forwarded
        req.on('data', (chunk) => req.body += chunk);
        req.on('end', () => {
          try {
            this._request_handler(req, res);
          } catch(err) {
            if (err instanceof HttpError) {
              console.log(`! ${req.url} Error ${err}`);
              res.writeHead(err.code, {'content-type': 'text/plain; charset=utf-8'});
              res.write(err.toString());
              res.end();
            } else {
              throw err;
            }
          }
        });
    }).bind(this);
  }
}

module.exports = Api;
