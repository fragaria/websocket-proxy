const crypto = require('crypto');

/** @typedef {(str | byte[]) } Hashable */

/**
 * Creates a cryptographically safe hash for provided `data`
 * @parameter data {hashable}  data to create hash from
 * @parameter length {int}  hash length in words (two bytes)
 */
function checksum(data, {length=3}={}) {
  return crypto.createHash('shake256', {outputLength: length}).update(data).digest('hex').replace(/(.{4})/g, ':$1').slice(1);
}

/**
 * Tries to get local IP address
 * Credits to https://stackoverflow.com/a/15075395
 */
function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];

    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
        return alias.address;
    }
  }
  return '0.0.0.0';
}

module.exports = {
  checksum: checksum,
  getIPAddress: getIPAddress,
}


