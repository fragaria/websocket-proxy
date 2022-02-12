'use strict';
// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const WebSocket = require('ws'),
      config = require('../config'),
      { unpackMessage } = require('./ws-message'),
      { debug, DEBUG } = require('../lib/logger');

/*
 * @clientsManager ... function (request, callback) which calls callback(err, client).
 *                    `err` is empty on success and client which should be an object with `key` property.
 */
function setupWebsocketServer(httpServer, clientsManager) {
  const webSocketServer = new WebSocket.Server({ noServer: true });

  if (config.logVerbosity >= DEBUG) {
    webSocketServer.on('connection', function connection(/*ws, request, client*/) {
      debug('Clients:')
      webSocketServer.clients.forEach(function each(client) {
        debug(`- ${client.id}`);
      });
    });
  }

  /**
   * Called when client requests upgrade to WebSocket
   */
  httpServer.on('upgrade', function upgrade(request, socket, head) {
    debug("Upgrading protocol to websocket.");
    clientsManager.authenticate(request, socket, (err, client) => {
      if (err || !client) {
        debug("Destroying connection");
        socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n','ascii');
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, function done(ws) {
        ws.on('close', function onClose() {
          debug(`Client ${client.id} closed connection.`);
          clientsManager.onClose(ws, client);
        });
        ws.on('message', (message)=>clientsManager.onMessage(unpackMessage(message), ws, client));
        clientsManager.onConnected(ws, client);
        ws.client_object = client;
        webSocketServer.emit('connection', ws, request, client);
      });
    });
  });
  return webSocketServer;
}

module.exports = setupWebsocketServer;
