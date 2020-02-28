const config = require('../config'),

      VERBOSE_DEBUG = 10,
      DEBUG = 7,
      INFO = 5,
      WARNING = 3,
      ERROR = 1;

function getLogger(importanceLevel, {prefix='', postfix='\n'}={}) {
  prefix = prefix === undefined ? '' : prefix;
  return function writeLog(...messages) {
    if (importanceLevel <= config.logVerbosity) {
      if (typeof prefix == 'function') prefix = prefix(messages);
      if (typeof postfix == 'function') postfix = postfix(messages);
      messages.unshift(prefix);
      messages.push(postfix);
      //console.log(...messages);
      process.stderr.write(messages.map(itm=>itm.toString()).join(' '));
    }
  }
}

getLogger.debug = (options) => getLogger(DEBUG, options);
getLogger.verboseDebug = (options) => getLogger(VERBOSE_DEBUG, options);
getLogger.info = (options) => getLogger(INFO, options);
getLogger.warning = (options) => getLogger(WARNING, options);
getLogger.error = (options) => getLogger(ERROR, options);

module.exports = {
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
