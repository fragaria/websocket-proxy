'use strict';
// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const http = require('http'),
      path = require('path'),
      { debug, info } = require('../lib/logger');

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


exports.getAuthenticator = function getAuthenticator(authenticatorUri, privateHostnamesToPass) {
  if (!authenticatorUri) throw new Error(`authenticatorUri is a required parameter`);
  if (privateHostnamesToPass) {
    if (typeof privateHostnamesToPass == 'string') privateHostnamesToPass = privateHostnamesToPass.split(',');
    if (!(privateHostnamesToPass instanceof Set)) privateHostnamesToPass = new Set(privateHostnamesToPass);
    debug(`Set hosts to skip auth: ${[...privateHostnamesToPass].join(', ')}.`);
  } else {
    privateHostnamesToPass = null;
  }
  return (key, request) => {
    let result;
    if (privateHostnamesToPass && privateHostnamesToPass.has(request.headers.host)) {
      debug(`Passing user with key ${key}, hostname '${request.headers.host}' matches one of ${[...privateHostnamesToPass].join(',')}.`);
      result = Promise.resolve({authenticated: false});
    } else {
      debug(`Authenticating ${key} from ${request.headers.host} to ${authenticatorUri}.`);
      result = fetchJson(
        path.join(authenticatorUri, '/key', key)
      )
        .then((response) => {
          debug(`Key ${key} authenticated.`);
          return {authenticated: true, token: response}
        })
        .catch((err) => {
          debug(`Key ${key} authentication failed: ${err}.`);
          throw err;
        });

    }
    return result;
  }
}
