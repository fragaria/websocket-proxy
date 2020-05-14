// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const test = require('ava'),
      nock = require('nock'),
      authenticator = require('../server/api-authenticator');

test('valid key passes', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com',
        response = {sub: 'userinfo', iss: 'iss'};
  nock(`${authServerUri}`).get(`/key/${key}`).reply(200, response);
  const authenticate = authenticator.getAuthenticator(authServerUri);
  return authenticate(key).then(clientInfo => {
    t.deepEqual(clientInfo, response);
  });
});

test('fail on invalid key', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com';
  nock(`${authServerUri}`).get(`/key/${key}`).reply(422);
  const authenticate = authenticator.getAuthenticator(authServerUri);
  return authenticate(key).catch((err) => {
    t.assert(err instanceof authenticator.InvalidKey)
  });
});


test('authentication rejected on server error', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com';
  nock(`${authServerUri}`).get(`/key/${key}`).reply(500);
  const authenticate = authenticator.getAuthenticator(authServerUri);
  return authenticate(key).catch((err) => {
    t.assert(!(err instanceof authenticator.InvalidKey))
  });
});
