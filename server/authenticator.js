'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

class KeyAuthenticator extends Object {
    constructor(allowed_keys) {
        super();
        this.allowed_keys = new Set(allowed_keys);
        this._clients_by_id = {};
    }

    authenticate(request, callback) {
      console.log(`Authenticating request ${request} on ${request.url}.`);
      const match = /^\/ws\/(?<client_key>.*)$/.exec(request.url);
      if (! match) return callback(new Error("Unknown url."));
      if (this.allowed_keys.has(match.groups.client_key)) {
        console.log(`Key ${match.groups.client_key} accepted`);
        callback(null, {"key": match.groups.client_key});
      } else {
        console.log('Invalid key');
        callback(new Error("Invalid key."), null);
      }
    }

    onConnected (ws, client) {
        this._clients_by_id[client.key] = ws;
        ws.id = client.key;
    }

    clientFromId (id) {
        return this._clients_by_id[id];
    }
}

module.exports = KeyAuthenticator;
