//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const test = require('ava'),
      { RequestMock, IncommingResponseMock, MessagingMock } = require('./_request.mock'),
      { WebSockProxyClient } = require('../client/client'),
      { packMessage, unpackMessage } = require('../server/ws-message');


function setup(request, response) {
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
    return context;
}


test.cb('send request', t => {
    const httpRequest = { method: 'get', url: '/x-url', headers: {'x-h': 'x-v'}, data: 'xyz'}
    const httpResponse = { statusCode: 200, statusMessage: 'OK', headers: {'x-r': 'x-r'}, data: 'abc'}

    const context = setup(httpRequest, httpResponse),
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

    ws.emit('message', packMessage({ event: 'headers', channel: '/req/234', data: {
      method: 'get',
      url: '/__ws_proxy_test__'}}));
    t.is(unpackMessage(ws.__messages.slice(-2, -1)[0]).data.toString(), 'Pong');
    t.end();

});
