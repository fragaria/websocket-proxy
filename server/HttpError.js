'use strict';
//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2

const http = require('http');

class HttpError extends Error {
  constructor(description, code, message) {
    super();
    this.code = code ? code : this._code;
    this.message = message ? message : http.STATUS_CODES[this.code.toString()];
    this.description = description ? description : 'N/A';
  }

  get _code() { return 500; }
  get _msg() { return "Internal server error"; }

  toString() {
    return `${this.code} ${this.message}`;
  }

  toResponse(res) {
      res.writeHead(this.code, {'content-type': 'application/json; charset=utf-8'});
      res.write(JSON.stringify({
        code: this.code,
        message: this.message,
        description: this.description,
      }));
      res.end();
  }
}

class BadGateway extends HttpError {
  get _code() {return 502;}
}

class BadRequest extends HttpError {
  get _code() {return 400;}
}

class Unauthorized extends HttpError {
  get _code() {return 401;}
}

class NotFound extends HttpError {
  get _code() {return 404;}
}

exports.HttpError = HttpError;
exports.BadGateway = BadGateway;
exports.NotFound = NotFound;
