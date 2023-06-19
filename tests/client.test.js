//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const test = require('ava'),
      { RequestMock, IncommingResponseMock, MessagingMock } = require('./_request.mock'),
      { WebSockProxyClient } = require('../client/client'),
      { packMessage, unpackMessage } = require('../server/ws-message');


function setup(response) {
  const key = "client.test.js",
        requestMock = new RequestMock(new IncommingResponseMock(response)),
        client = new WebSockProxyClient(key),
        context = {
          proxy: client, reqMock: requestMock,
          key: key, wsServer: 'ws://fakeserver/test', websocketPath: 'ws-path-to-test',
          forwardTo: 'http://localhost/forwardUrl',
        }

  client.__web_socket = MessagingMock;
  client.__http = {request: requestMock.http_request};
  client.connect( context.wsServer, {
    forwardTo: context.forwardTo,
    websocketPath: context.websocketPath,
  });
  context.ws = MessagingMock.__lastInstance;
  context.ws.emit('open');
  context.client = client;
  return context;
}


test('send request', t => {
  const httpRequest = { method: 'get', url: '/x-url', headers: {'x-h': 'x-v'}, data: 'xyz'}
  const httpResponse = { statusCode: 200, statusMessage: 'OK', headers: {'x-r': 'x-r'}, data: 'abc'}

  const context = setup(httpResponse),
        { ws, reqMock } = context;
  t.deepEqual(ws.__lastCall('constructor').arguments, [`${context.wsServer}${context.websocketPath}/${context.key}`]);


  ws.emit('message', packMessage({ event: 'headers', channel: '/req/123',
                                   data: httpRequest,
  }));

  reqMock.__assertCalled('__makeRequest');
  const reqParams = reqMock.__lastCall('__makeRequest').arguments[0];
  t.is(reqParams.method, httpRequest.method);
  t.is(reqParams.href, `${context.forwardTo}${httpRequest.url}`);
  t.deepEqual(reqParams.headers, httpRequest.headers);

  const headersMessage = unpackMessage(ws.__lastMessage);
  t.is(headersMessage.event, 'headers');
  t.is(headersMessage.channel, '/req/123');
  t.is(headersMessage.data.statusCode, httpResponse.statusCode);
  t.deepEqual(headersMessage.data.headers, httpResponse.headers);
  reqMock.__sendResponse(false);
  const dataMessage = unpackMessage(ws.__lastMessage);
  t.is(dataMessage.event, 'data');
  t.is(dataMessage.data, httpResponse.data);
  reqMock.__endResponse();
  t.is(unpackMessage(ws.__lastMessage).event, 'end');
});


/**
 */
test('forward to a specific port', t => {
  const port = 443;
  const httpRequest = { method: 'get', url: '/', headers: {'x-karmen-port': `${port}`}},
        context = setup(),
        { ws, reqMock } = context;

  ws.emit('message', packMessage({ event: 'headers', channel: '/req/123',
                                   data: httpRequest,
  }));

  const reqParams = reqMock.__lastCall('__makeRequest').arguments[0];
  t.is(reqParams.href, context.forwardTo.replace('localhost', `localhost:${port}`) + httpRequest.url);
  t.is(reqParams.headers['x-karmen-port'], undefined);
});

test.skip('try to acces port which is not allowed', t => {
  const httpRequest = { method: 'get', url: '/', headers: {'x-karmen-port': '1234'}},
        { ws } = setup();

  t.throws(
    ()=>ws.emit('message', packMessage({ event: 'headers', channel: '/req/123', data: httpRequest})),
    {message: /Port 1234 is not allowed.*/}
  );

});

test.skip('invalid message event id throws an error', (t) => {
  const { ws } = setup();
  t.throws(
    ()=>ws.emit('message', packMessage({ event: 'bad-event', channel: '/req/123'})),
    {message: /.*bad-event.*/});
});


test('repeated connect throws an error', t => {
  const context = setup({}, {});
  t.throws(
    ()=>context.client.connect(0, 0, 0),
    {message: /connected/}
  )
});

test('closing connection which was not open yet', t => {
  const client = new WebSockProxyClient();
  t.throws( ()=>client.close(), {message: /not connected/});
});

test.cb('message called when connection closed', t => {
  const { ws } = setup(),
        { logs, INFO } = require('../lib/logger');

  let lastLog;
  logs.once(INFO, (...args)=>lastLog = args);
  ws.emit('close');
  setImmediate(()=> {
    t.assert(lastLog[0].match(/connection closed/));
    t.end();
  });

});
