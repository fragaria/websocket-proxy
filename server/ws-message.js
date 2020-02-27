//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const events = require('events');
const { debug } = require('../lib');
const { BufferStruct, BufferStructType } = require('../lib/buffer-struct');

const MessageTypeView = new BufferStructType([
    {name: 'channel', type: 'str', size: 64},
    {name: 'event', type: 'str', size: 16},
    {name: 'dataType', type: 'uint'},
    {name: 'data', type: 'buffer', size: 0},  // dynamic size
]);

const TYPE_BUFFER = 0,
      TYPE_OBJECT = 1,
      TYPE_UNDEFINED = 2;

exports.MessageTypeView = MessageTypeView;

function packMessage(message) {
    if (message.data instanceof Buffer) {
        message.dataType = TYPE_BUFFER;
    } else if (message.data === undefined) {
        message.dataType = TYPE_UNDEFINED;
        message.data = Buffer.alloc(0); // e.g. void buffer
    } else {
        message.dataType = TYPE_OBJECT;
        message.data = Buffer.from(JSON.stringify(message.data));
    }
    return MessageTypeView.fromJSON(message);
}

function unpackMessage(message) {
    message = MessageTypeView.toJSON(message);
    if (message.dataType == TYPE_OBJECT) {
        message.data = JSON.parse(message.data);
    } else if (message.dataType == TYPE_UNDEFINED) {
        message.data = undefined;
    }
    delete message.dataType
    return message;
}

exports.packMessage = packMessage;
exports.unpackMessage = unpackMessage;



class Messanger {
    constructor(webSocket) {
        const self = this;
        this.channels = new events.EventEmitter();
        this.webSocket = webSocket;
        this._listeners = {};
        //webSocket.on('message', function decodeMessage(message) {
        //    const unpackedMessage = MessageTypeView.toJSON(message));
        //    self.channels.emit(
        //        unpackedMessage.channel, 
        //        unpackedMessage,
        //        self._buildResponseSender(unpackedMessage.channel),
        //    );
        //});
    }

    on(eventName, callback) {

        if (eventName == 'message') {
            const newCallback = function unpackMessageMiddleware(message) {
                try {
                    message = unpackMessage(message);
                } catch (err) {
                    console.error('Error unpacking message.', message);
                    throw (err);
                }
                return callback(message);
            }
            this._listeners[callback] = newCallback;
            return this.webSocket.on('message', newCallback);
        } else {
            return this.webSocket.on(eventName, callback);
        }
    }

    off(eventName, callback) {
      if (eventName == 'message' && this._listeners[callback]) {
        this.webSocket.off('message', this._listeners[callback]);
        delete(this._listeners[callback]);
      } else {
        this.webSocket.off(eventName, callback);
      }
    }



    _buildResponseSender(channel) {
        const self = this;
        return function responseSender(eventName, message) {
            self.send(channel, eventName, message);
        };
    }

    send(channel, eventName, payload) {
        let message = {
            channel: channel,
            event: eventName,
            data: payload,
        }
        this.webSocket.send(packMessage(message));
    }
}

exports.Messanger = Messanger;
