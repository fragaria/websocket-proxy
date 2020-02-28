//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';

const config = require('../config'),
      EventEmitter = require('events'),
      logs = new EventEmitter(),

      VERBOSE_DEBUG = 10,
      DEBUG = 7,
      INFO = 5,
      WARNING = 3,
      ERROR = 1;

let LOGGING_FUNCTION = process.stderr.write.bind(process.stderr);


function writeLog(importanceLevel, prefix, postfix, loggingFunction, ...messages) {
  logs.emit(importanceLevel, ...messages);
  logs.emit('message', ...messages);

  if (importanceLevel <= config.logVerbosity) {
    if (typeof prefix == 'function') prefix = prefix(messages);
    if (typeof postfix == 'function') postfix = postfix(messages);
    messages.unshift(prefix);
    messages.push(postfix);
    messages = messages.map(itm=>itm.toString()).join(' ');
    return loggingFunction(messages);
    //console.log(...messages);

  }
}


function getLogger(importanceLevel, {prefix='', postfix='\n', loggingFunction=LOGGING_FUNCTION}={}) {
  prefix = prefix === undefined ? '' : prefix;
  return writeLog.bind({}, importanceLevel, prefix, postfix, loggingFunction);

}

getLogger.debug = (options) => getLogger(DEBUG, options);
getLogger.verboseDebug = (options) => getLogger(VERBOSE_DEBUG, options);
getLogger.info = (options) => getLogger(INFO, options);
getLogger.warning = (options) => getLogger(WARNING, options);
getLogger.error = (options) => getLogger(ERROR, options);

module.exports = {
  logs: logs,
  getLogger: getLogger,
  verboseDebug: getLogger.verboseDebug(),
  debug: getLogger.debug(),
  info: getLogger.info(),
  warning: getLogger.warning(),
  error: getLogger.error(),
  DEBUG: DEBUG,
  INFO: INFO,
  WARNING: WARNING,
  ERROR: ERROR,
}
