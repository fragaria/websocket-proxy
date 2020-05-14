'use strict';
// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const http = require('http'),
      path = require('path'),
      { debug } = require('../lib/logger');

class InvalidKey extends Error { }
exports.InvalidKey = InvalidKey;

function fetchJson(url, options) {
  debug(`fetching ${url}`);
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      let dataChunks = [];
      res.on('data', chunk => dataChunks.push(chunk));
      res.on('end', () => {
        let responseBody = dataChunks.join('');
        if (res.statusCode == 200) {
          debug(`auth server: 200 - key accepted`);
          resolve(JSON.parse(responseBody));
        } else if (res.statusCode == 422) {
          debug(`auth server: 422 - invalid key`);
          reject(new InvalidKey('Invalid key'));
        } else {
          debug(`key server returned ${res.statusCode}.`);
          const err = new Error('Error getting response from auth server.');
          err.res = res;
          reject(err)
        }
      });
    });
    req.on('error', error => {
      debug(`Error sending response: ${error}`);
      reject(error);
    }),
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
      let url = new URL(authenticatorUri);
      url.pathname = path.join(url.pathname, '/key', key);
      result = fetchJson(url.toString())
        .then((response) => {
          debug(`Key ${key} authenticated.`);
          return {authenticated: true, token: response}
        })
        .catch((err) => {
          debug(`Key ${key} authentication failed: ${err}.`);
          if(!(err instanceof InvalidKey)) {
            debug(err);
          }
          throw err;
        });

    }
    return result;
  }
}
