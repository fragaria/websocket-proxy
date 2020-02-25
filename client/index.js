'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const WebSockProxyClient = require('./client').WebSockProxyClient;
const config = require('../config');


function usage() {
  console.log(`USAGE:

    client <client-key> <server_host>[:<server_port>] [forwardTo]

    client-key    ... unique key to identify client on server
    server_host   ... hostname or ip address of websocket proxy server
    server_port   ... port of websocket proxy server
    forward_to    ... base uri to forward all requests to (defaults to
                      http://localhost)

`);
}

function die(message, {edify=true}={}) {
  if (edify) usage();
  if (message) console.log(message);
  process.exit();
}

const client_key = process.argv[2] ? process.argv[2] : config.client.key;
const serverUrl =  process.argv[3] ? process.argv[3] : config.client.serverUrl;
const forwardTo = process.argv[4] ? process.argv[4] : config.client.forwardTo;


client_key || die("Missing client key.");
serverUrl || die("Missing server uri.");
forwardTo || die("Missing forwarding location.");

console.log(`
client_key: ${client_key}
serverUrl: ${serverUrl}
forwardTo: ${forwardTo}
`);


new WebSockProxyClient(client_key)
  .connect(serverUrl, {forward_to: forwardTo })
  .on('error', function clientError() {
    console.error(`Could not connect to remote server ${serverUrl}.

      Make sure the server is running on the address port specified?
      `);
  })
  .on('open', function clientOnConnect() {
    console.log(`Tunnel ${serverUrl} -> ${forwardTo} set up and ready.`);
  })
  .on('close', function clientOnClose() {
    console.log('Connection closed, exitting.');
    process.exit();
  });
