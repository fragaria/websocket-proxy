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

const client_key = process.argv[2] ? process.argv[2] : process.env.WS_PROXY_KEY;
const ws_server =  process.argv[3] ? process.argv[3] : process.env.WS_PROXY_SERVER;
const forward_to = process.argv[4] ? process.argv[4] : process.env.WS_PROXY_FORWARD_TO;


client_key || die("Missing client key.");
ws_server || die("Missing server uri.");
forward_to || die("Missing forwarding location.");

console.log(`
client_key: ${client_key}
ws_server: ${ws_server}
forward_to: ${forward_to}
`);


new WebSockProxyClient(client_key)
  .connect(ws_server, {forward_to: forward_to })
  .on('error', function clientError() {
    console.error(`Could not connect to remote server ${ws_server}.

      Make sure the server is running on the address port specified?
      `);
  })
  .on('open', function clientOnConnect() {
    console.log(`Tunnel ${ws_server} -> ${forward_to} set up and ready.`);
  })
  .on('close', function clientOnClose() {
    console.log('Connection closed, exitting.');
    process.exit();
  });
