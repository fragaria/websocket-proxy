'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const http = require('http');
const WebSocket = require('ws');


/*
 * @authenticator ... function (request, callback) which calls callback(err, client).
 *                    `err` is empty on success and client which should be an object with `key` property.
 */
function setupWebsocketServer(httpServer, authenticator) {
  const webSocketServer = new WebSocket.Server({ noServer: true });

  webSocketServer.on('connection', function connection(ws, request, client) {

    // TODO: should be run in debug mode only
    console.log('Clients:')
    webSocketServer.clients.forEach(function each(client) {
       console.log(`- ${client.id}`);
    });
    ws.on('message', function message(msg) {
      // console.log(`Received message from client ${client.key}`);
    });
  });

  httpServer.on('upgrade', function upgrade(request, socket, head) {
    console.log("Upgrading protocol.");
    authenticator.authenticate(request, (err, client) => {
      if (err || !client) {
        console.log("Destroying connection");
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, function done(ws) {
        console.log("Emitting ws connection");
        ws.send(JSON.stringify({"data": "ping"}));
        ws.on('close', function onClose() {
          console.log(`Client ${client.key} closed connection.`);
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
