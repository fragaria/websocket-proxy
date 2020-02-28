'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const WebSocket = require('ws'),
      config = require('../config'),
      { debug, DEBUG } = require('../lib/logger');



/*
 * @authenticator ... function (request, callback) which calls callback(err, client).
 *                    `err` is empty on success and client which should be an object with `key` property.
 */
function setupWebsocketServer(httpServer, authenticator) {
  const webSocketServer = new WebSocket.Server({ noServer: true });

  webSocketServer.on('connection', function connection(/*ws, request, client*/) {

    if (config.logVerbosity >= DEBUG) {
      debug('Clients:')
      webSocketServer.clients.forEach(function each(client) {
        debug(`- ${client.id}`);
      });
    }
  });

  httpServer.on('upgrade', function upgrade(request, socket, head) {
    debug("Upgrading protocol.");
    authenticator.authenticate(request, socket, (err, client) => {
      if (err || !client) {
        debug("Destroying connection");
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, function done(ws) {
        ws.on('close', function onClose() {
          debug(`Client ${client.id} closed connection.`);
          authenticator.onClose(ws, client);
        });
        ws.on('message', (message)=>authenticator.onMessage(message, ws, client));
        authenticator.onConnected(ws, client);
        ws.client_object = client;
        webSocketServer.emit('connection', ws, request, client);
      });
    });
  });
  return webSocketServer;
}

module.exports = setupWebsocketServer;
