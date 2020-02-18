'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

class DecodeError extends Error {}

class WsJsonProtocol extends Object {

    constructor(ws) {
        super();
        this._ws = ws;
    }

    _encode(messageObject) {
        return JSON.stringify(messageObject, undefined, 3);
    }

    _decode(rawMessage) {
        try {
            return JSON.parse(rawMessage);
        } catch(err) {
            throw DecodeError(`Could not decode message ... ${err.toString()}`);
        }
    }

    send(messageObject) {
        if (! messageObject instanceof Object) {
            throw new Error(`Type error, expected Object but got ${typeof messageObject}.`);
        }
        this._ws.send(this._encode(messageObject));
    }

    on(eventName, callback) {
        let decode_ = this._decode.bind(this);
        let decoderCallback = function (message) {
            console.log(`decoding message ${message}`);
            let decodedMessage;
            try {
                decodedMessage = decode_(message);
            } catch(err) {
                console.error(err);
            }
            console.log(`decoded message ${JSON.stringify(decodedMessage, undefined, 3)}`);
            if (decodedMessage !== undefined) {
                callback(decodedMessage);
            }
        }
        if (eventName == "message") {
            return this._ws.on(eventName, decoderCallback);
        } else {
            return this._ws.on(eventName, callback);
        }
            
    }
}


module.exports = WsJsonProtocol;
