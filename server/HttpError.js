'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

class HttpError extends Error {
  constructor(code, message) {
    super();
    this.code = code ? code : this._code;
    this.message = message ? message : this._msg;
  }

  get _code() { return 500; }
  get _msg() { return "Internal server error"; }
  toString() {
    return `${this.code} ${this.message}`;
  }
}

class BadGateway extends HttpError {
  get _code() {return 502;}
  get _msg() { return "Bad gateway"; }
}

exports.HttpError = HttpError;
exports.BadGateway = BadGateway;
