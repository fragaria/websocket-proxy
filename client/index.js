'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const WebSockProxyClient = require('./client').WebSockProxyClient,
      config = require('../config'),
      { info, error } = require('../lib/logger');


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
  if (message) error(message);
  process.exit(1);
}

function Client(key, forwardTo) {
  const self = this;
  this.wsProxy = new WebSockProxyClient(key);
  this.close = this.wsProxy.close.bind(this.wsProxy);
  this.connect = function connect(serverUrl, config={forwardTo:forwardTo}) {
    return new Promise((resolve, reject) => {
      const connection = this.wsProxy.connect(serverUrl, config);
      connection
        .on('error', function clientError(err) {
          error(`An error occured while connecting to ${serverUrl}.

            Error: ${err}.

            Make sure the server is running on the address port specified?
            `);
        })
        .on('error', reject)
        .on('open', ()=> {
          connection.off('error', reject);
          resolve(self);
        });
    });
  }
}
module.exports = Client;

if (require.main == module) {

  const clientKey = process.argv[2] ? process.argv[2] : config.client.key;
  const serverUrl =  process.argv[3] ? process.argv[3] : config.client.serverUrl;
  const forwardTo = process.argv[4] ? process.argv[4] : config.client.forwardTo;


  clientKey || die("Missing client key.");
  serverUrl || die("Missing server uri.");
  forwardTo || die("Missing forwarding location.");

  info(`
  client_key: ${clientKey}
  serverUrl: ${serverUrl}
  forwardTo: ${forwardTo}
  `);

  new Client(clientKey)
    .connect(serverUrl, {requestTimeout: config.requestTimeout, forwardTo: forwardTo}).then((client) => {
      client.wsProxy
        .on('open', function clientOnConnect() {
          info(`Tunnel ${serverUrl} -> ${config.forwardTo} set up and ready.`);
        })
        .on('close', function clientOnClose() {
          info('Connection closed, exitting.');
        })
        .on('close', () => process.exit(1));
    });
}
