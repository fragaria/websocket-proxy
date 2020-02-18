'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const http = require('http');
const setupWebsocketServer = require('./server');
const Api = require('./api');
const ClientsManager = require('./clients-manager');
const clientsManager = new ClientsManager({
  allowed_keys: true,  // true - pass any key; a list - pass individual keys
  path_prefix: '/ws',
});

function usage() {
  console.log(`USAGE:

    server [[<server_host>:]<server_port>]

    server_host   ... hostname or ip address of websocket proxy server
                      (defaults to 0.0.0.0)
    server_port   ... port of websocket proxy server (defaults to 8000)

`);
}


let [server_host, server_port] = process.argv[2].split(':', 2);
if (server_port === undefined && !isNaN(server_host)) {
  server_port = server_host;
  server_host = '0.0.0.0';
}

if (!server_port) server_port=8000;

const apiServer = new Api( '/api', clientsManager);
const httpServer = http.createServer(apiServer.request_handler);
const webSocketServer = setupWebsocketServer(httpServer, clientsManager);

httpServer.on("listening", function onListening() {
  let addr = httpServer.address();
  console.log(`
    Listening on ${addr.address}:${addr.port}.
    To connect clients run:

    node client <client-key> <server-host>:${addr.port} <uri-to-redirect-to>
    `);

});

httpServer.listen(server_port, server_host);

