const crypto = require('crypto');
const DEBUG = process.env.DEBUG;

function checksum(data, {length=5}={}) {
  try {
    return crypto.createHash('md5').update(data).digest('hex').slice(0,length).replace(/(.{4})/g, ':$1').slice(1);
  } catch(err) {
    console.error(err, data);
    throw err;
  }
}

function debug() {
  if (DEBUG) console.log.apply(console, arguments);
}

class ConsoleStatusBar {

    constructor (left, top, width) {
        this.left = left;
        this.top = top;
        this.width = width;
    }

    write(s) {
        process.stdout.write('\u001B[s\u001B[1;1f: ' + s.padEnd(this.width-4)+ ' :\u001B[u');
    }
}

module.exports = {
    checksum: checksum,
    debug: debug,
    ConsoleStatusBar: ConsoleStatusBar,
}


