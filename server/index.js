'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const http = require('http');
const WebSocket = require('ws');
const Api = require('./api');
const KeyAuthenticator = require('./authenticator');
const authenticator = new KeyAuthenticator(['kpz-1', 'kpz-2', 'kpz-3']);
let server = http.createServer(
  new Api(
    '/api',
    authenticator.clientFromId.bind(authenticator)
  ).request_handler
);
const wss = new WebSocket.Server({ noServer: true });


let [server_host, server_port] = process.argv[2].split(':', 2);
if (server_port === undefined && !isNaN(server_host)) {
  server_port = server_host;
  server_host = '0.0.0.0';
}

if (!server_port) server_port=8000;
/*
 * @authenticator ... function (request, callback) which calls callback(err, client).
 *                    `err` is empty on success and client which should be an object with `key` property.
 */
function createServer(authenticator) {
  wss.on('connection', function connection(ws, request, client) {

    // TODO: should be run in debug mode only
    wss.clients.forEach(function each(client) {
          console.log('Client.ID: ' + client.id);
      });
    ws.on('message', function message(msg) {
      // console.log(`Received message from client ${client.key}`);
    });
  });

  server.on('upgrade', function upgrade(request, socket, head) {
    console.log("Upgrading protocol.");
    authenticator.authenticate(request, (err, client) => {
      if (err || !client) {
        console.log("Destroying connection");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, function done(ws) {
        console.log("Emitting ws connection");
        ws.send(JSON.stringify({"data": "ping"}));
        ws.on('close', function onClose() {
          console.log(`Client ${client.key} closed connection.`);
          authenticator.onClose(ws, client);
        });
        authenticator.onConnected(ws, client);
        ws.client_object = client;
        wss.emit('connection', ws, request, client);
      });
    });
  });
  return server;
}

server = createServer(authenticator)
server.on("listening", function onListening() {
  let addr = server.address();
  console.log(`
    Listening on ${addr.address}:${addr.port}.
    To connect clients run:

    node client <client-key> <server-host>:${addr.port} <uri-to-redirect-to>
    `);

});
server.listen(server_port, server_host);

