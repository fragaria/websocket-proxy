const crypto = require('crypto');

function checksum(data, {length=5}={}) {
  return crypto.createHash('md5').update(data).digest('hex').slice(0,length).replace(/(.{4})/g, ':$1').slice(1);
}

module.exports = {
  checksum: checksum,
}


