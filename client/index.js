'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const WebSockProxyClient = require('./client').WebSockProxyClient;


function usage() {
  console.log(`USAGE:

    client <client-key> <server_host>[:<server_port>] [forward_to]

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

const client_key = process.argv[2];
const server_host_port = process.argv[3];
const forward_to = process.argv[4];


client_key || die("Missing client key.");
server_host_port || die("Missing server host:port.");


new WebSockProxyClient(client_key)
  .connect(server_host_port, {forward_to: forward_to })
  .on('error', function clientError() {
    console.error(`Could not connect to remote server ${server_host_port}.

      Make sure the server is running on the address port specified?
      `);
  })
  .on('close', function clientOnClose() {
    console.log('Connection closed, exitting.');
    process.exit();
  });
