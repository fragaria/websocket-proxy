const test = require('ava'),
      {RequestMock, IncommingResponseMock} = require('./_request.mock');


test.cb('request mock', t => {
    const requestMock = new RequestMock();
    const http_request = requestMock.http_request;
    t.deepEqual(requestMock.__response.toJSON(), new IncommingResponseMock().toJSON());
    const dataToSend = Buffer.from('some testing requst data');
    let returnedData = Buffer.alloc(0);

    const req = http_request('http://example.com/path/?search=value#hash', {method: 'POST', headers: {a:'b'}}, (response) => {
        const expectedResponse = requestMock.__response;
        t.deepEqual(expectedResponse.toJSON(), response.toJSON());
        response.on('data', (chunk) => {
            returnedData = Buffer.concat([returnedData, chunk]);
        });
        response.on('end', () => {
            t.deepEqual(returnedData, requestMock.__response.__data);
            t.end();
        })
    });

    req.send(dataToSend);
    req.end();
});


test.cb('request mock constructor arguments', t => {
    const requestMock = new RequestMock(new IncommingResponseMock({statusCode:404, statusMessage: 'Not Found', headers:{}, data:null}));
    requestMock.http_request('http://example.com', {}, (response) => {
        t.deepEqual(response.toJSON(), {statusCode: 404, statusMessage: 'Not Found', headers: {}, data: null});
        response.on('end', t.end);
    }).end();
});


test.cb('post data', t => {
    const requestMock = new RequestMock();
    const request = requestMock.http_request('http://example.com', {}, (response) => {
        response.on('end',  () => {
            t.deepEqual(requestMock.__writtenDataChunks, ['chunk1', 'chunk2']);
            t.end();
        });
    })
    request.write('chunk1');
    request.write('chunk2');
    request.end();

});
