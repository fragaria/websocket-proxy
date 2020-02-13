'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const http = require('http');
const WebSocket = require('ws');
const Api = require('./api');

let CLIENTS_BY_ID = {};
const server = http.createServer(new Api('/api', (id)=>CLIENTS_BY_ID[id]).request_handler);
const wss = new WebSocket.Server({ noServer: true });

const registered_keys = new Set(['kpz-1', 'kpz-2', 'kpz-3']);

const authenticate = (request, cb) => {
  console.log(`Authenticating request ${request} on ${request.url}.`);
  const match = /^\/ws\/pill\/(?<client_key>.*)$/.exec(request.url);
  if (! match) return cb(new Error("Unknown url."));
  if (registered_keys.has(match.groups.client_key)) {
    console.log(`Key ${match.groups.client_key} accepted`);
    cb(null, {"name": "one", "key": match.groups.client_key});
  } else {
    console.log('Invalid key');
    cb(new Error("Invalid key."), null);
  }
}



wss.on('connection', function connection(ws, request, client) {

  ws.id = client.key;
  CLIENTS_BY_ID[client.key] = ws;
  wss.clients.forEach(function each(client) {
        console.log('Client.ID: ' + client.id);
    });
  ws.on('message', function message(msg) {
    console.log(`Received message ${msg} from client ${client.key}`);
  });
});

server.on('upgrade', function upgrade(request, socket, head) {
  console.log("Upgrading protocol.");
  authenticate(request, (err, client) => {
    if (err || !client) {
      console.log("Destroying connection");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, function done(ws) {
      console.log("Emitting ws connection");
      wss.emit('connection', ws, request, client);
    });
  });
});


server.listen(8080);
