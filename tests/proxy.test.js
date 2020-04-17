'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const fs   = require('fs'),
      test = require('ava'),
      http = require('http'),
      nock = require('nock');

const socketFilePath = '/tmp/ws_proxy.sock';


test('resend request', t => {
  nock('http://example.com')
    .get('/').reply(200, 'content');

  return makeRequest('/api/client-1/').then((res) => {
    t.is(res.statusCode, 200);
    t.is(res.body.toString(), 'content');
  });
});

test('post big binary data', t => {
  const payload = Buffer.from('some payload'.repeat(800));
  nock('http://example.com')
    .post('/post-endpoint', payload)
    .reply(201);
  return makeRequest('/api/client-1/post-endpoint', {method: 'post'}, payload).then((res) => {
    t.is(res.statusCode, 201);
  });
});


test('big binary data download', t => {
  const payload = Buffer.from('some payload'.repeat(800));
  nock('http://example.com')
    .get('/some-big-file')
    .reply(200, payload);
  return makeRequest('/api/client-1/some-big-file',).then((res) => {
    t.is(res.statusCode, 200);
    t.is(res.fullBody.length, payload.length);
    t.deepEqual(res.fullBody, payload);
  });
});

test('headers sent', t => {
  const path = '/headers-sent',
        headers = {'x-a': 'x-b'};
  nock('http://example.com', {
    reqheaders: headers}).get(path).reply(200);
  return makeRequest(`/api/client-1/${path}`, {headers: headers}).then((res) => {
    t.is(res.statusCode, 200);
  });
});

/*
test('headers received', t => {
  const path = '/headers-received',
        headers = {'x-a': 'x-b'};
  nock('http://example.com')
    .defaultReplyHeaders(headers)
    .get(path).reply(201);
  return makeRequest(`/api/client-1/${path}`).then((res) => {
    t.is(res.statusCode, 201);
    t.is(res.headers, headers);
  });
});
*/

test('request timeout', t => {
  const path = '/timeout';
  nock('http://example.com')
    .get(path).delay(140).reply(200);
  return makeRequest(`/api/client-1/${path}`).then((res) => {
    t.is(res.statusCode, 502);
  });
});

test('request abort', t => {
  const path = '/error';
  nock('http://example.com')
    .get(path).replyWithError('some error');
  return makeRequest(`/api/client-1/${path}`).then((res) => {
    t.is(res.statusCode, 502);
  });
  
});

test.before(t => {
  const Server = require('../server'),
        Client = require('../client'),

        server = new Server(),
        client = new Client('client-1', ),

        // configuration passed to the client
        clientConfig = {
          forwardTo: 'http://example.com/',
          requestTimeout: 120,
        }

  // socket file is not released when tests fail
  if (fs.existsSync(socketFilePath)) {
    fs.unlinkSync(socketFilePath);
  }
  t.context = {
    server: server,
    client: client,
  }
  return server.listen(socketFilePath).then(()=>{  /// start server
    return client.connect(`ws+unix://${socketFilePath}:`, clientConfig).then(() => {
    }).catch(()=>console.error('Client could not connect.'));
  }).catch(()=>console.error('Server could not connect.'));




});

test.after(t => {
  t.context.client.close();
  t.context.server.close();
  if(fs.existsSync(socketFilePath)) {
    fs.unlinkSync(socketFilePath);
  }
});
/*
 * Simple inefficient request maker
 */
function makeRequest(path, config = {}, payload='') {
  if (!config) config = {}
  let data = {
    body: [],
  }
  return new Promise((resolve, reject) => {
    config.socketPath = socketFilePath;
    config.path = path;

    const handleResponse = response => {
      Object.assign(data, {
        statusCode: response.statusCode,
        statusMessage: response.StatusMessage,
        headers: response.headers,
      });
      response.on('error', reject);
      response.on('data', chunk=>data.body.push(chunk));
      response.on('end', ()=> {
        data.fullBody = Buffer.concat(data.body);
        resolve(data);
      });
    }
    const req = http.request(config, handleResponse);

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}
