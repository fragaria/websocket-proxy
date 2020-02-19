'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const REQ_SIZE_LIMIT = 1024*1024;
const checksum = require('../lib').checksum;
const uuid = require('uuid');
const { HttpError, BadGateway, NotFound } = require('./HttpError');


class ForwardedRequest extends Object {
  constructor(request, response, resource_path, client_websocket, client_id) {
    super();
    if (! client_websocket) throw new BadGateway();
    this.request = request;
    this.response = response;
    this.id = uuid.v4();
    this.client_websocket = client_websocket;
    this.target_path = resource_path;

    this.channelUrl = `/req/${client_id}/${this.id}`;

    this.resendHeader();

  }

  handleResponseMessage(message, destroyCallback) {
     const callback = this[`on_${message.event}`].bind(this);
     return callback(message, destroyCallback);
  }

  on_headers(message) {
      console.log(`<:   ${this.channelUrl}:  ${message.data.statusCode} ${message.data.statusMessage}
        ${JSON.stringify(message.data.headers)}
        / ${message.event} ${this.request.method} ${this.request.url}`);
      this.response.writeHead(message.data.statusCode, message.data.statusMessage, message.data.headers);
  }

  on_data(message) {
      if (message.data instanceof Object) {
        message.data = Buffer.from(message.data)
      }
      console.log(`<:   ${this.channelUrl}:  data ${checksum(message.data)}`);
      this.response.write(message.data);
  }

  on_end(message, destroyCallback) {
      console.log(`<:   ${this.channelUrl}:  end`);
      this.response.end();
      destroyCallback();
      // TODO: cleanup / delete this instance
  }

  on_error(message, destroyCallback) {
      console.log(`<:   ${this.channelUrl}:  error`);
      new BadGateway(JSON.stringify(message.data, undefined, 3)).toResponse(this.response);
      destroyCallback();
  }

  resendHeader() {
    let request_data = {
      method: this.request.method,
      headers: this.request.headers,
      url: this.target_path,
    }
    console.log(` :>  ${this.channelUrl}:  ${this.request.method} ${this.request.url}`);
    this.sendMessage('headers', request_data); 
  }

  resendDataChunk(chunk) {
    console.log(`  :> ${this.channelUrl} data${checksum(chunk)}`);
    this.sendMessage('data', chunk.toString()); // FIXME: is it binary safe?
  }

  resendError(error) {
    this.sendMessage('error', error);
  }

  resendEnd() {
    console.log(`  :>${this.channelUrl} end`);
    this.sendMessage('end');
  }

  sendMessage(eventId, payload) {
    this.client_websocket.send(JSON.stringify({
      channel: this.channelUrl,
      event: eventId,
      data: payload,
    }, undefined, 3));
  }


}

class Api extends Object {

  constructor(path_prefix, clientsManager) {
    console.log(`Starting API with path prefix '${path_prefix}'.`);
    super();
    if (! path_prefix) {
      path_prefix = '/';
    }
    this._path_prefix = path_prefix;
    this._clientsManager = clientsManager;
    this._activeChannels = {};
    clientsManager.listenToMessages(this.messageDispatcher.bind(this));
  }

  

  messageDispatcher(message, ws, client) {
    try {
      message = JSON.parse(message);
    } catch(err) {
      console.error(`Got unparsable message from ${client.key}.`);
      return;
    }
    const channelUrl = message.channel;
    const channel = this._activeChannels[channelUrl];
    if (channel) {
      channel.handleResponseMessage(message, () => delete this._activeChannels[channelUrl]);
    }
  }

  _request_handler(req, res) {
    console.log(`<    ${req.method} ${req.url} ... matching against ${this._path_prefix}`);
    let path_info = this._parse_request_path(req);
    if (!path_info || !path_info.id || ! path_info.resource) {
      return new NotFound(`Invalid url ${req.url}.`).toResponse(res);
    }
    const client_id = path_info.id
    const resource_path = path_info.resource;
    const client_websocket = this._clientsManager.clientFromId(client_id);
    const requestInstance = new ForwardedRequest(req, res, resource_path, client_websocket, client_id);

    this._activeChannels[requestInstance.channelUrl] = requestInstance;

    req.on('data', requestInstance.resendDataChunk.bind(requestInstance));
    req.on('end', requestInstance.resendEnd.bind(requestInstance));
    req.on('error', requestInstance.resendError.bind(requestInstance));
  }


  /**
   * Request handler for entry point of http <-> websocket <-> http tunnel
   */
  get request_handler() {
    return (function (req, res) {
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
    }).bind(this);
  }


  _parse_request_path(req) {
    let m = req.url.match(new RegExp(`^${this._path_prefix}/(?<id>[^/]*)(?<resource>/.*)$`));
    return m ? m.groups : null; 
  }

}

module.exports = Api;
