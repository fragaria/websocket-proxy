const crypto = require('crypto');
const DEBUG = process.env.DEBUG;

function checksum(data, {length=5}={}) {
  try {
    return crypto.createHash('md5').update(data).digest('hex').slice(0,length).replace(/(.{4})/g, ':$1').slice(1);
  } catch(err) {
    console.error(err, data);
    throw err;
  }
}

function debug() {
  if (DEBUG) console.log.apply(console, arguments);
}

module.exports = {
    checksum: checksum,
    debug: debug,
}
