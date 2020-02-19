//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const crypto = require('crypto');

function checksum(data, {length=5}={}) {
  try {
    return crypto.createHash('md5').update(data).digest('hex').slice(0,length).replace(/(.{4})/g, ':$1').slice(1);
  } catch(err) {
    console.error(err, data);
    throw err;
  }
}

exports.checksum = checksum;
module.exports.WsJsonProtocol = require('./ws-json').WsJsonProtocol;
