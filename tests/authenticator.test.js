// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
const test = require('ava'),
      nock = require('nock'),
      authenticator = require('../server/api-authenticator'),
      fakeRequest = {headers: {host: 'http://example.com'}};

test('valid key passes', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com',
        response = {sub: 'userinfo', iss: 'iss'};
  nock(authServerUri).get(`/key/${key}`).reply(200, response);
  const authenticate = authenticator.getAuthenticator(authServerUri);
  return authenticate(key, fakeRequest).then(clientInfo => {
    t.deepEqual(clientInfo, {authenticated: true, token: response});
  });
});

test('auth is skipped for selected hostnames even when the key is invalid', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com',
        authenticate = authenticator.getAuthenticator(authServerUri, 'a.example.com,b.example.com'),
        request = {headers: {host: 'b.example.com'}},
        promises = [];

  promises.push(
    authenticate(key, request).then(clientInfo => {
      t.is(clientInfo.authenticated, false);
    })
  );
  // nock(authServerUri).get(`/key/${key}`).reply(422);
  // promises.push(
  //   authenticate(key, fakeRequest).catch((err) => {
  //     t.assert(err instanceof authenticator.InvalidKey)
  //   })
  // );
  return Promise.all(promises);
});

test('fail on invalid key', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com';
  nock(`${authServerUri}`).get(`/key/${key}`).reply(422);
  const authenticate = authenticator.getAuthenticator(authServerUri, 'a.example.com,b.example.com');
  return authenticate(key, fakeRequest).catch((err) => {
    t.assert(err instanceof authenticator.InvalidKey)
  });
});



test('authentication rejected on server error', t => {
  const key = 'some-secret-key',
        authServerUri = 'http://example.com';
  nock(`${authServerUri}`).get(`/key/${key}`).reply(500);
  const authenticate = authenticator.getAuthenticator(authServerUri);
  return authenticate(key, fakeRequest).catch((err) => {
    t.assert(!(err instanceof authenticator.InvalidKey))
  });
});
