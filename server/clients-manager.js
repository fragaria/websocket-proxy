//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const EventEmitter               = require('events'),
      checksum                   = require('../lib').checksum,
      {BadRequest, Unauthorized} = require('./HttpError'),
      { debug, info, warning }   = require('../lib/logger');

class ClientsManager extends Object {
    constructor({allowed_keys=[], path_prefix='/ws'}={}) {
        super();
        this.events = new EventEmitter();
        if (allowed_keys === true) {
          this.allowed_keys = true;
        } else {
          this.allowed_keys = new Set(allowed_keys);
        }
        this._clients_by_id = {};
        this.path_prefix = path_prefix;
        this.messageSubscribers = [];
    }

    makeClient(clientKey) {
      let client = new EventEmitter();
      client.id = checksum(clientKey);
      return client;
    }

    authenticate(request, socket, callback) {
      info(`Authenticating request ${request} on ${request.url}.`);
      const match = request.url.match(new RegExp(`^${this.path_prefix}/(?<client_key>.*)$`));
      if (! match) return callback(new Error("Unknown url."));
      if (this.clientFromId(match.groups.client_key)) return callback(new BadRequest("The key is already used by another client."));
      if (this.allowed_keys === true || this.allowed_keys.has(match.groups.client_key)) {
        debug(`Key ${match.groups.client_key} accepted`);
        callback(null, this.makeClient(match.groups.client_key));
      } else {
        info('Invalid key');
        callback(new Unauthorized("Invalid key."), null);
      }
    }


    onConnected (ws, client) {
      client.webSocket = ws;
      client.webSocket.on('message', (message)=>client.emit('message', message, client));
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
      this.events.emit('message', message, client),
      this.messageSubscribers.forEach(function (subscriber) {
        subscriber(message, ws, client);
      });
    }
}

module.exports = ClientsManager;
