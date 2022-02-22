//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const EventEmitter                  = require('events'),
      checksum                      = require('../lib').checksum,
      {BadRequest, Unauthorized}    = require('./HttpError'),
      { packMessage }               = require('./ws-message'),
      { debug, info }               = require('../lib/logger');

class ClientsManager extends Object {
  constructor({path_prefix = '/ws', authenticate = undefined} = {}) {
    super();
    this.events = new EventEmitter();
    this._clients_by_id = {};
    this.path_prefix = path_prefix;
    this.messageSubscribers = [];
    this.authenticator = authenticate;
  }

  makeClient(clientKey, clientInfo) {
    let client = new EventEmitter();
    client.id = checksum(clientKey);
    client.info = clientInfo;
    client.send = (message) => client.webSocket.send(packMessage(message));
    return client;
  }

  authenticate(request, socket, callback) {
    info(`Authenticating request ${request} on ${request.url}.`);
    const match = request.url.match(new RegExp(`^${this.path_prefix}/(?<client_key>.*)$`));
    if (! match) return callback(new Error("Unknown url."));
    if (this.clientFromId(checksum(match.groups.client_key))) return callback(new BadRequest("The key is already used by another client."));
    const clientKey = match.groups.client_key;
    if (this.authenticator) {
      this.authenticator(clientKey, request, socket)
        .then((clientInfo) => {
          debug(`Key ${match.groups.client_key} accepted`);
          callback(null, this.makeClient(clientKey, clientInfo));
        })
        .catch((error) => {
          info(`Error authenticating user '${clientKey}': ${error}.`);
          callback(new Unauthorized(error, null));
        });
    } else {
      callback(null, this.makeClient(clientKey));
    }
  }


  onConnected (ws, client) {
    client.webSocket = ws;
    this._clients_by_id[client.id] = client;
    ws.id = client.id;
    client.emit('connected', client)
    this.events.emit('connected', client);
  }

  onClose (ws, client) {
    client.emit('close', client);
    delete this._clients_by_id[client.id];
    this.events.emit('close', client);
  }

  clientFromId (id) {
    return this._clients_by_id[id];
  }

  listenToMessages(callback) {
    this.messageSubscribers.push(callback);
  }

  onMessage(message, ws, client) {
    if (message.channel == 'ping-pong') {
      client.send({
        channel: message.channel,
        event: 'pong',
      });
    } else {
      this.events.emit('message', message, client),
      client.emit('message', message, client)
      this.messageSubscribers.forEach(function (subscriber) {
        subscriber(message, ws, client);
      });
    }
  }
}

module.exports = ClientsManager;
