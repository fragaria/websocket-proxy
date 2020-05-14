'use strict';
// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const http = require('http'),
      path = require('path');

class InvalidKey extends Error { }
exports.InvalidKey = InvalidKey;

function fetchJson(url, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      let dataChunks = [];
      res.on('data', chunk => dataChunks.push(chunk));
      res.on('end', () => {
        let responseBody = dataChunks.join('');
        if (res.statusCode == 200) {
          resolve(JSON.parse(responseBody));
        } else if (res.statusCode == 422) {
          reject(new InvalidKey());
        } else {
          const err = new Error('Error getting response from auth server.');
          err.res = res;
          reject(err)
        }
      });
    });
    req.on('error', error => reject(error));
    req.end();
  });
}


exports.getAuthenticator = function getAuthenticator(authenticatorUri) {
  if (!authenticatorUri) throw new Error(`authenticatorUri is a required parameter`);
  return (key) => {
    return fetchJson(
      path.join(authenticatorUri, '/key', key)
    );
  }
}
