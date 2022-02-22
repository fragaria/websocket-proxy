'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const { checksum } = require('../lib'),
      { getLogger } = require('../lib/logger'),
      { HttpError, BadGateway, NotFound } = require('./HttpError');

const debug    = getLogger.debug({prefix: '\u001b[33mS:d', postfix: '\u001b[0m\n'}),
      info     = getLogger.info({prefix: '\u001b[32mS/i', postfix: '\u001b[0m\n'}),
      warning  = getLogger.warning({prefix: '\u001b[31mS/w', postfix: '\u001b[0m\n'}),
      error    = getLogger.error({prefix: '\u001b[31mS/!', postfix: '\u001b[0m\n'});


class ForwardedRequest extends Object {
  constructor(request, response, resource_path, client) {
    super();
    if (! client.webSocket) throw new BadGateway("The other site is not connected.");
    this.request = request;
    this.response = response;
    this.id = (Math.random()*10e10).toString(16);
    this.client = client;
    this.target_path = resource_path;
    this.channelUrl = '/req/' + checksum(this.id, 6);

    this.resendHeaders();
  }

  handleResponseMessage(message, destroyCallback) {
    let callback;
    try {
      callback = this[`on_${message.event}`].bind(this);
    } catch (err) {
      error(`Unknown message event ${message.event}`);
      throw err;
    }
    return callback(message, destroyCallback);
  }

  on_headers(message) {
    debug(`<:   ${this.channelUrl}:  ${message.data.statusCode} ${message.data.statusMessage}
        / ${message.event} ${this.request.method} ${this.request.url}`);
    this.response.writeHead(message.data.statusCode, message.data.statusMessage, message.data.headers);
  }

  on_data(message) {
    if (message.data instanceof Object) {
      message.data = Buffer.from(message.data)
    }
    debug(`<:   ${this.channelUrl}:  data ${checksum(message.data)}`);
    this.response.write(message.data);
  }

  on_end(message, destroyCallback) {
    debug(`<:   ${this.channelUrl}:  end`);
    this.response.end();
    destroyCallback();
    // TODO: cleanup / delete this instance
  }

  on_error(message, destroyCallback) {
    info(`<:   ${this.channelUrl}:  error: ${message.data}`);
    new BadGateway(message.data).toResponse(this.response);
    this.on_end(message, destroyCallback);
  }

  resendHeaders() {
    let request_data = {
      method: this.request.method,
      url: this.target_path,
      headers: this.request.headers,
    }
    debug(` :>  ${this.channelUrl}:  ${this.request.method} ${this.request.url}`);
    this.sendMessage('headers', request_data); 
  }

  resendDataChunk(chunk) {
    debug(`  :> ${this.channelUrl} data${checksum(chunk)}`);
    this.sendMessage('data', chunk.toString()); // FIXME: is it binary safe?
  }

  resendError(error) {
    this.sendMessage('error', error);
  }

  resendEnd() {
    debug(`  :>${this.channelUrl} end`);
    this.sendMessage('end');
  }

  sendMessage(eventId, payload) {
    const message = {
      channel: this.channelUrl,
      event: eventId,
      data: payload,
    };
    this.client.send(message);
  }


}

class Api extends Object {

  /**
   * @param {string} path_prefix
   * @param {ClientsManager} clientsManager
   */
  constructor(path_prefix, clientsManager) {
    info(`Starting API with path prefix '${path_prefix}'.`);
    super();
    if (! path_prefix) {
      path_prefix = '/';
    }
    this._path_prefix = path_prefix;
    this._clientsManager = clientsManager;
    this._activeChannels = {};
    this._activeClients = new Set();
    this._onClientMessage = this.__onClientMessage.bind(this);
    this._onClientClose = this._removeClient.bind(this);
  }

  deleteChannel(channelUrl) {
    debug(`Deleting channel ${channelUrl}`);
    delete this._activeChannels[channelUrl];
  }

  __onClientMessage(message) {
    const channelUrl = message.channel;
    const channel = this._activeChannels[channelUrl];
    if (channel) {
      channel.handleResponseMessage(message, ()=>this.deleteChannel(channelUrl));
    }
  }

  /**
   * Forwards API request to and from the device.
   */
  _request_handler(req, res) {
    info(`<    ${req.method} ${req.url} ... matching against ${this._path_prefix}`);
    let path_info = this._parse_request_path(req);
    if (!path_info || !path_info.id || ! path_info.resource) {
      throw new NotFound(`Invalid url ${req.url}.`);
    }
    const
          client_id = checksum(path_info.id),
          resource_path = path_info.resource,
          client = this._clientsManager.clientFromId(client_id);
    if (! client ) {
      throw new BadGateway(`Client with id ${client_id} is not connected.`);
    }
    if (!this._activeClients.has(client.id)) {
      this.registerClient(client);
    }
    const requestInstance = new ForwardedRequest(req, res, resource_path, client);

    this._activeChannels[requestInstance.channelUrl] = requestInstance;

    req.on('data', requestInstance.resendDataChunk.bind(requestInstance));
    req.on('end', requestInstance.resendEnd.bind(requestInstance));
    req.on('error', requestInstance.resendError.bind(requestInstance));
  }

  /**
   * Removes client when the connection was lost (disconnection or error)
   */
  _removeClient(client) {
    client.off('message', this._onClientMessage);
    client.off('close', this._onClientClose);
    this._activeClients.delete(client.id);
  }

  /**
   * Registers new connected client (device)
   */
  registerClient(client) {
    this._activeClients.add(client.id);
    client.on('message', this._onClientMessage);
    client.on('close', this._onClientClose);
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
          warning(`! ${req.url} Error ${err}`);
          err.toResponse(res);
        } else {
          throw (err);
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
