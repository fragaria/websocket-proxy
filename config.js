const fs   = require('fs'),
      path = require('path'),
      merge    = require('merge');

function val(envName, defaultValue) {
  return (process.env[envName]) ? process.env[envName] : defaultValue;
}

let CONFIG = {
  server: {
    host: val('ADDRESS', 'localhost'),
    port: val('PORT', '8090'),
    // key server url
    // empty value means no authenticator (allow any key to connect)
    // http(s)://... - a url for key-master APIs
    keyServerUrl: val('KEY_SERVER_URL', undefined),
    keyServerIgoreForHostnames: val('KEY_SERVER_IGNORE_FOR_HOSTNAMES', undefined),
  },
  client: {
    key: val('KEY', 'client-1'),
    serverUrl: val('SERVER_URL', 'ws://localhost:8090'),
    forwardTo: val('FORWARD_TO', 'http://prusa3d.local'),
  },
  /*
     VERBOSE_DEBUG = 10,
     DEBUG = 7,
     INFO = 5,
     WARNING = 3,
     ERROR = 1;
  */
  logVerbosity: val('VERBOSITY', 3),
  requestTimeout: val('REQUEST_TIMEOUT', 30000),
  keepAlivePingInterval: val('KEEP_ALIVE_PING_INTERVAL', 15),
}

if (fs.existsSync(path.join(__dirname, 'config-local.js')) || fs.existsSync(path.join(__dirname, 'config-local/index.js'))) {
  let localConfig = require('./config-local');
  CONFIG = merge.recursive(CONFIG, localConfig);
}
module.exports = CONFIG;
