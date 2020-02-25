const fs = require('fs'),
      _  = require('lodash');

function val(envName, defaultValue) {
    return (process.env[envName]) ? process.env[envName] : defaultValue;
}

let CONFIG = {
    server: {
        host: val('ADDRESS', 'localhost'),
        port: val('PORT', '8090'),
    },
    client: {
        key: val('KEY', 'C1'),
        serverUrl: val('SERVER_URL', 'ws://localhost:8090'),
        forwardTo: val('FORWARD_TO', 'http://prusa3d.local'),
    },
    logVerbosity: 3,
}

if (fs.existsSync('config-local.js') || fs.existsSync('config-local/index.js')) {
    let localConfig = require('./config-local');
    CONFIG = _.merge(CONFIG, localConfig);
}
module.exports = CONFIG;
