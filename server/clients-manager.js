//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const fs                            = require('fs'),
      EventEmitter                  = require('events'),
      checksum                      = require('../lib').checksum,
      config                        = require('../config'),
      {BadRequest, Unauthorized}    = require('./HttpError'),
      { packMessage }               = require('./ws-message'),
      { debug, info, error }        = require('../lib/logger');

const CLIENT_INACTIVE_AFTER = config.server.clientInactiveAfter;

class ClientsManager extends Object {
  constructor({path_prefix = '/ws', authenticate = undefined} = {}) {
    super();
    this.events = new EventEmitter();
    this._clients_by_id = {};
    this._dumpClients();  // to fail fast when output file is unaccessible
    this.path_prefix = path_prefix;
    this.messageSubscribers = [];
    this.authenticator = authenticate;
  }

  /**
   * @parameter clientKey {String}  Unique string identifying the client device.
   * @parameter touch {bool}  Wether to update client's last activity timestamp
   *                         upon creation.
   */
  makeClient(clientKey, socket, clientInfo, authenticated=false, touch = true) {
    let client = new EventEmitter();
    client.id = checksum(clientKey);
    client.socket = socket;
    client.info = clientInfo;
    client.send = (message) => client.webSocket.send(packMessage(message));
    client.lastActivityTimestamp = undefined;
    client._authenticated = authenticated;
    // update client's lastActivityTimestamp (i.e. reset inactivity interval)
    client.touch = () => client.lastActivityTimestamp = Date.now();
    client.toString = () => `WSClient: id=${client.id}, auth=${client._authenticated}, act=${client.getInactivitySeconds()}`;
    // interval in seconds the client has been inactive for
    client.getInactivitySeconds = () => (Date.now() - client.lastActivityTimestamp)/1000;
    if (touch) {
      client.touch();
    }
    return client;
  }


  authenticate(request, socket, callback) {
    info(`Authenticating request to ${request.url} from ${request.ip}.`);

    const auth_callback = () => {
      if (this.authenticator) {
        this.authenticator(clientKey, request, socket)
          .then((clientInfo) => {
            debug(`Key ${clientKey} accepted`);
            callback(null, this.makeClient(clientKey, socket, clientInfo, true));
          })
          .catch((error) => {
            info(`Error authenticating user '${clientKey}': ${error}.`);
            callback(new Unauthorized(error, null));
          });
      } else {
        callback(null, this.makeClient(clientKey, socket, undefined, true));
      }
    }

    const match = request.url.match(new RegExp(`^${this.path_prefix}/(?<client_key>.*)$`));
    if (! match) return callback(new Error("Unknown url."));
    const clientKey = match.groups.client_key;
    const client = this.clientFromId(checksum(clientKey));
    if (client) {
      info(`Client ${client} reconnection requested.`);
      if (client.getInactivitySeconds() < CLIENT_INACTIVE_AFTER) {
        // client is already connected but not active
        info(`Client ${client} rejected.`);
        return callback(new BadRequest("The key is already used by another client."));
      } else {
        // client exists but no longer active
        info(`Client ${client} passed.`);
        client.once('close', () => auth_callback());
        client.socket.destroy();
      }
    } else {
      auth_callback();
    }

  }

  _dumpClients() {
    if (config.server.clientListDumpFile) {
      fs.writeFile(
        config.server.clientListDumpFile,
        Object.entries(this._clients_by_id).map(k => k[0]).join('\n'),
        err => {
          if (err) {
            error('Could not write list of clients (check SERVER_CLIENT_LIST_DUMP_FILE', err);
            throw(err);
          }
        }
      );
    }
  }

  onConnected (ws, client) {
    client.webSocket = ws;
    this._clients_by_id[client.id] = client;
    ws.id = client.id;
    ws.client = client;
    client.emit('connected', client)
    this.events.emit('connected', client);
    this._dumpClients();
  }

  onClose (ws, client) {
    delete this._clients_by_id[client.id];
    client.emit('close', client);
    this.events.emit('close', client);
    this._dumpClients();
  }

  clientFromId (id) {
    return this._clients_by_id[id];
  }

  listenToMessages(callback) {
    this.messageSubscribers.push(callback);
  }

  onMessage(message, ws, client) {
    client.touch();
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
