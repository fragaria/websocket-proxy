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

module.exports = {
  checksum: checksum,
}


