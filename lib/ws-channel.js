'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const { BufferStruct, BufferStructType } = require('./buffer-struct');


class StructWebSocket {
    constructor(format, websocket) {
      this._bufferStruct = new BufferStructType(format);
      this._ws = websocket;
    }

    on(eventType, callback) {
      const self = this;
      if (eventType == 'message') {
        callback = (message)=>callback(self._bufferStruct.toJson(message));
      }
      return this._ws.on(eventType, callback);
    }

    send(data) {
      this._ws.send(this._bufferStruct.fromJson(data);
    }
}

exports.StructWebSocket = StructWebSocket;


