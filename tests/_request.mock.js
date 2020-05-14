'use strict'
const EventEmitter = require('events'),
      _      = require('lodash'),
      assert = require('assert');

const MOCK_LOG = [];

class Mock extends Object {
  constructor(...args) {
    super();
    if (this.constructor.__instances) {
      this.constructor.__instances.push(this);
    } else {
      this.constructor.__instances = [this];
    }
    this.constructor.__lastInstance = this;
    this.__log = []
    this.__recordCall('constructor', args);
    MOCK_LOG.push(this);
  }

  get __lastInstance() {
    return this.constructor.__instances.slice(-1);
  }
  __lastCalls(methodName, {count=0}={}) {
    let calls;
    if (methodName) {
      calls = this.__log.filter((itm)=>itm.method == methodName);
    } else {
      calls = this.__log;
    }
    if (count) calls = calls.slice(-count);
    return calls;
  }

  __lastCall(methodName) {
    const lastCall = this.__lastCalls(methodName).slice(-1);
    if (lastCall) {
      return lastCall[0];
    } else {
      return null;
    }
  }

  __assertLastCall(methodName, args, message) {
    const expectedLogEntry = {method: methodName, arguments: args};
    const actualLogEntry = this.__lastCall();
    assert.deepStrictEqual(actualLogEntry, expectedLogEntry, message);
  }

  __assertCalled(methodName, args) {
    let calls = this.__lastCalls(methodName)
    assert.ok(calls.length > 0, `Method ${methodName} was not called`);
    if (args !== undefined) {
      if (calls.length == 1) {
        assert.deepStrictEqual(calls[0].arguments, args);
      } else {
        calls = calls.filter((itm) => _.isEqual(itm.arguments, args));
        assert(calls, `Method ${methodName} was not called with given arguments.`);
      }
    }
  }

  __recordCall(method, args) {
    this.__log.push({method: method, arguments:args});
  }

  __monitor(...methods) {
    methods.forEach((methodName)=>{
      const decoratedMethodName = `__monitored__${methodName}`;
      this[decoratedMethodName] = this[methodName];
      this[methodName] =  (...args) => {
        this.__recordCall(methodName, args);
        return this[decoratedMethodName](...args);
      }
    });
  }

  __replace(methodName, replacement) {
    replacement = replacement !== undefined ? replacement : (()=>{});
    const oldMethod = this[methodName];
    this[methodName] = (...args) => {
      return replacement(oldMethod, ...args);
    }
    this.__monitor(methodName);
  }

}
exports.Mock = Mock;


class MessagingMock extends Mock {
  constructor(...args) {
    super(...args);
    this.__emitter = new EventEmitter();
    this.__theOther = new EventEmitter();
    this.__monitor('on', 'off', 'send', 'emit');
    this.__messages = [];
  }

  on(...args) {
    this.__emitter.on(...args);
  }
  off(...args) {
    this.__emitter.off(...args);
  }
  emit(...args) {
    this.__emitter.emit(...args);
  }
  send(message) {
    this.__messages.push(message);
    this.__theOther.emit('message', message);
  }

  __on(...args) {
    return this.__theOther.on(...args);
  }

  __off(...args) {
    return this.__theOther.off(...args);
  }

  get __lastMessage() {
    return this.__messages ? this.__messages.slice(-1)[0] : null;
  }
}
exports.MessagingMock = MessagingMock;

class IncommingMessageMock extends MessagingMock {
  constructor(headers, data) {
    super();
    this.__value = {
      headers: headers,
      data: data,
    }
    this.__encoding = null;
    this.__dataSent = false;
  }

  toJSON() {
    return this.__value;
  }

  get headers() {
    return this.__value.headers;
  }

  get __data() {
    return this.__value.data;
  }

  setEncoding(encoding) {
    this.__encoding = encoding;
  }

  __assertEqual(other) {
    assert.deepStrictEqual(this.toJSON(), other.toJSON());
  }

  __sendData(sendEnd) {
    sendEnd = sendEnd === undefined || sendEnd;
    assert.strictEqual(this.__dataSent, false);
    let data = this.__value.data;
    if (data) {
      if (this.__encoding) {
        data = data.toString(this.__encoding);
      }
      this.__emitter.emit('data', data);
    }
    if (sendEnd) setImmediate(()=>this.__sendEnd());
    this.__dataSent = true;
  }

  __sendEnd() {
    this.__emitter.emit('end');
  }
}

class IncommingRequest extends IncommingMessageMock {
  constructor(url, {method='GET', headers={}, data=null}={}) {
    super(headers, data);
    Object.assign(this.__value, {
      method: method,
      url: url,
    });
  }

  get method() {return this.__value.method;}
  get url() {return this.__value.url;}
}
exports.IncommingRequest = IncommingRequest;

const DEFAULT_RESPONSE = {
  statusCode: 200,
  statusMessage: 'OK',
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'x-mock-header': 'x-mock-header-value',
  },
  data: Buffer.from('příliš žluťoučký kůň úpěl ďábelské ódy.'),
}

class IncommingResponseMock extends IncommingMessageMock {
  constructor(response) {
    if (!response) {
      response = _.clone(DEFAULT_RESPONSE);
    }
    super(response.headers, response.data);
    Object.assign(this.__value, {
      statusCode: response.statusCode,
      statusMessage: response.statusMessage,
    });
  }
  get statusCode() {return this.__value.statusCode;}
  get statusMessage() {return this.__value.statusMessage;}
}
exports.IncommingResponseMock = IncommingResponseMock;


class RequestMock extends MessagingMock {
  constructor(response) {
    super();
    if (!response) {
      response = new IncommingResponseMock();
    }
    this.__response = response;
        
    this.__monitor('write', 'end', '__makeRequest');
    this.__writtenDataChunks = [];
    this.__isEnded = false;

  }

  __request_method(url, options, callback) {
    if (url) {
      url = new URL(url);
      options = _.merge(options, url);
    }
    return this.__makeRequest(options, callback);
  }

  get http_request() {
    return this.__request_method.bind(this);
  }

  __makeRequest(options, callback) {
    callback(this.__response);
    return this;
  }

  __sendResponse(sendEnd) {
    this.__response.__sendData(sendEnd);
  }

  __endResponse() {
    this.__response.__sendEnd();
  }

  write(data) {
    this.__writtenDataChunks.push(data);
  }

  end() {
    this.__response.__sendData();
    this.__isEnded = true;
  }

}

exports.RequestMock = RequestMock;


if (require.main == module) {
  // Mock
  const mockConstructorArguments = ['arg1', 'arg2'];
  const mock = new Mock(...mockConstructorArguments);
  assert.strictEqual(Mock.__lastInstance, mock);
  mock.__assertLastCall('constructor', mockConstructorArguments);
  let functionArgs;
  const mockMethodArguments = ['marg1', 'marg2'];
  mock.someMethod = function (...args) {functionArgs = args; return args};
  mock.__monitor('someMethod');
  const response = mock.someMethod(...mockMethodArguments);
  mock.__assertLastCall('someMethod', mockMethodArguments);
  assert.deepStrictEqual(response, mockMethodArguments);
  assert.deepStrictEqual(mockMethodArguments, functionArgs);


  // MessagingMock
  const messagesMock = new MessagingMock();
  const messages = [];

  messagesMock.on('message', messages.push.bind(messages));
  messagesMock.send({a:1});
  assert.deepStrictEqual(messages, [{a:1}]);
  assert.deepStrictEqual(messagesMock.__lastMessage, {a:1});
  messagesMock.__assertLastCall('send', [{a:1}]);
}
