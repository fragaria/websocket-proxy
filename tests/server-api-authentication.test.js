// vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const test = require('ava'),
      fs = require('fs'),
      nock = require('nock'),
      socketFilePath = '/tmp/ws_proxy-auth-test.sock';

test('connection is closed with wrong key', t => {
  const Client = require('../client'),
        client = new Client(t.context.invalidKey, ),
        clientConfig = { forwardTo: 'http://example.com/' };

  return client.connect(`ws+unix://${socketFilePath}:`, clientConfig)
    .catch((err) => {
      t.is(err.code, 'ECONNRESET');
    });
});

test('connection accepted with a valid key', t => {
  const Client = require('../client'),
        client = new Client(t.context.validKey, ),
        clientConfig = { forwardTo: 'http://example.com/' };

  return client.connect(`ws+unix://${socketFilePath}:`, clientConfig)
    .then((client) => {
      t.pass('Client connected.');
      client.close();
    });
});

test.before(t => {
  const validKey = 'some-secret-key',
        invalidKey = 'some-invalid-key',
        validKeyResponse = {sub: 'userinfo', iss: 'iss'},
        authServerUri = 'http://authserveruri.example.com',
        Server = require('../server'),
        server = new Server(authServerUri);

  nock(`${authServerUri}`).persist().get(`/key/${validKey}`).reply(200, validKeyResponse);
  nock(`${authServerUri}`).persist().get(`/key/${invalidKey}`).reply(422);

  // socket file is not released when tests fail
  if (fs.existsSync(socketFilePath)) {
    fs.unlinkSync(socketFilePath);
  }
  t.context = {
    server: server,
    validKey: validKey,
    invalidKey: invalidKey,
  }
  return server.listen(socketFilePath)
    .then((...args) => {
      console.log('Server is listening', ...args)
      throw new Error('test');
    })
    .catch(()=>console.error('Server could not connect.'));

});

test.after(t => {
  t.context.server.close();
  if(fs.existsSync(socketFilePath)) {
    fs.unlinkSync(socketFilePath);
  }
});
