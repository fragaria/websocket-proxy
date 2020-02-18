'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const {BadRequest, Unauthorized} = require('./HttpError');

class ClientsManager extends Object {
    constructor({allowed_keys=[], path_prefix='/ws'}={}) {
        super();
        if (allowed_keys === true) {
          this.allowed_keys = true;
        } else {
          this.allowed_keys = new Set(allowed_keys);
        }
        this._clients_by_id = {};
        this.path_prefix = path_prefix;
        this.messageSubscribers = [];
    }

    authenticate(request, callback) {
      console.log(`Authenticating request ${request} on ${request.url}.`);
      const match = request.url.match(new RegExp(`^${this.path_prefix}/(?<client_key>.*)$`));
      if (! match) return callback(new Error("Unknown url."));
      if (this.clientFromId(match.groups.client_key)) return callback(new BadRequest("The key is already used by another client."));
      if (this.allowed_keys === true || this.allowed_keys.has(match.groups.client_key)) {
        console.log(`Key ${match.groups.client_key} accepted`);
        callback(null, {"key": match.groups.client_key});
      } else {
        console.log('Invalid key');
        callback(new Unauthorized("Invalid key."), null);
      }
    }

    onConnected (ws, client) {
        this._clients_by_id[client.key] = ws;
        ws.id = client.key;
    }

    onClose (ws, client) {
        delete this._clients_by_id[client.key];
    }

    clientFromId (id) {
        return this._clients_by_id[id];
    }

    listenToMessages(callback) {
      this.messageSubscribers.push(callback);
    }

    onMessage(message, ws, client) {
      this.messageSubscribers.forEach(function (subscriber) {
        subscriber(message, ws, client);
      });
    }
}

module.exports = ClientsManager;
