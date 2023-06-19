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
    // number of seconds of client inactivity after which the connection is
    // considered dead
    clientInactiveAfter: val('CLIENT_INACTIVE_AFTER_SECS', 90),
    clientListDumpFile: val('SERVER_CLIENT_LIST_DUMP_FILE', undefined)
  },
  client: {
    key: val('KEY', 'client-1'),
    serverUrl: val('SERVER_URL', 'ws://localhost:8090'),
    forwardTo: val('FORWARD_TO', 'http://prusa3d.local'),
    // ports to which the request can be forwarded
    allowedForwardToPorts: val('FORWARD_TO_PORTS', '80, 443').split(',').map(s=>s.trim()),
  },
  /*
     VERBOSE_DEBUG = 10,
     DEBUG = 7,
     INFO = 5,
     WARNING = 3,
     ERROR = 1;
  */
  logVerbosity: val('VERBOSITY', 5),
  requestTimeout: val('REQUEST_TIMEOUT', 30000),
  keepAlivePingInterval: val('KEEP_ALIVE_PING_INTERVAL', 60),
  sentry: {
    dsn: val('SENTRY_DSN', undefined),
    environment: val('SENTRY_ENV', undefined),
  },
}

if (fs.existsSync(path.join(__dirname, 'config-local.js')) || fs.existsSync(path.join(__dirname, 'config-local/index.js'))) {
  let localConfig = require('./config-local');
  CONFIG = merge.recursive(CONFIG, localConfig);
}
module.exports = CONFIG;
