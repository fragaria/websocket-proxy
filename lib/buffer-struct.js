//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const { debug } = require('./logger');

class InvalidValueError extends Error { }

class BufferStruct extends Buffer {

  toJSON() {
    return this._bufferStructType.toJSON(this);
  }

  unpack() {
    return this._bufferStructType.unpack(this);
  }

}

BufferStruct.adapt = function adapt(buffer, bufferStructType) {
  Object.setPrototypeOf(buffer, BufferStruct.prototype);
  buffer._bufferStructType = bufferStructType;
  return buffer;
}

BufferStruct.forType = function forType(bufferStructType) {
  let buffer = Buffer.alloc(bufferStructType.size);
  return BufferStruct.adapt(buffer, bufferStructType);
}


class BufferStructType {

  constructor(definitions) {
    this._fields = definitions;
    const fieldNames = definitions.map((field)=>field.name);
    if (new Set(fieldNames).size != definitions.length) {
      throw new Error(`There's a duplicate field name in ${fieldNames.join(', ')}.`);
    }
    this._fields.forEach(function prepareDefinitions(def, defOrder) {
      if (defOrder == definitions.length - 1) def._isLast = true;

      switch (def.type) {
        case 'int':
          if (def.size === undefined) def.size = 4;
          def.type = `Int${def.size*8}`;
          if (def.size > 1) def.type += 'LE';
          break;
        case 'uint':
          if (def.size === undefined) def.size = 4;
          def.type = `UInt${def.size*8}`;
          if (def.size > 1) def.type += 'LE';
          break;
        case 'float':
          if (def.size == 8) {
            def.type = 'DoubleLE';
          } else {
            def.type = 'FloatLE';
            if (def.size === undefined) def.size = 4;
          }
          break;
        case 'double':
          if (def.size === undefined) def.size = 8;
          def.type = 'DoubleLE';
          break;
        case 'buffer':
          if (def._isLast && def.size === 0) {
            // allow dynamic length
            def._dynamicSize = true;
          }
          break;
        case 'str':
          break;
        default:
          throw new Error(`Unkwnon type ${def.type} for field ${def.name}.`);
      }

      if ((!def.size || isNaN(def.size)) && !def._dynamicSize) {
        throw new Error(`Field ${def.name} has invalid size ${def.size}.`);
      }
    });
  }


  pack(values) {
    const self = this;
    let offset = 0;
    let data = BufferStruct.forType(this);
    this._fields.forEach(function packField(def, n) {
      const val = values[n];
      let realSize;
      if (def._dynamicSize) { // last item
        if (def.type != 'buffer') throw new Error("Dynamic size is supported on 'buffer' type.");
        if (! (val instanceof Buffer)) throw new Error(`Expected type Buffer for ${def.name} but got '${val}'.`);
        if (def.size) throw new Error(`Dynamic must not have a size specified.`);
        // debug(`-- ${JSON.stringify(val)}`);
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32LE(val.length);
        debug(`Pack dynamic ${def.name} of size ${sizeBuffer} ${offset}+${val.length}+${sizeBuffer.length}.`);
        data = Buffer.concat([
          data.subarray(0, offset),  // original message
          sizeBuffer,         // size indicator (till the end of record)
          val,                       // the buffer
        ], offset + sizeBuffer.length + val.length);
        realSize = val.length + sizeBuffer.length;
      } else {
        const target = data.subarray(offset, offset + def.size);      
        // debug(`pack ${offset}, ${def.size}`, val);
        realSize = self._packField(def, val, target);
      }
      offset += realSize;
    });
    return BufferStruct.adapt(data.subarray(0, offset), this);
  }

  _packField(def, val, target) {
    let realSize = def.size;
    if (val === undefined) throw new InvalidValueError(`Missing value for for ${def.name}.`);
    if (def.type == 'str' || def.type == 'buffer') {
      if (val instanceof Buffer) {
        realSize = val.length;
        val.copy(target, 4); 
        realSize = val.length;
      } else {
        if (!(typeof val == 'string' || val instanceof String)) {
          val = val.toString();
        }
        realSize = val.length;
        target.write(val.toString(), 4);
      }
      if (val.length > def.size - 4) throw new InvalidValueError(`The value for ${def.name} is too long to fit.`);
      target.writeUInt32LE(realSize);
      realSize += 4;
    } else {
      // TODO: guess type by size
      const packMeth = `write${def.type}`;
      if (target[packMeth]) {
        target[packMeth](val); 
      } else {
        throw new Error(`Invalid type ${def.type} (Buffer has not method '${packMeth}'.`);
      }
    }
    return realSize;
  }

  unpack(data) {
    const self = this;
    let offset = 0;
    const values = [];
    if (!(data instanceof Buffer)) {
      throw new Error(`Data is expected to be Buffer found ${data} instead.`);
    }
    this._fields.forEach(function unpackField(def) {
      const val = data.subarray(offset, def.size ? (offset + def.size) : undefined);
      // debug(`unpack ${def.name} at ${offset}, size ${def.size}`, val);
      let [unpackedValue, realSize] = self._unpackField(def, val);
      values.push(unpackedValue);
      offset += realSize;
    });
    return values;
  }

  _unpackField(def, val) {
    let realSize = def.size;
    let unpackedValue;
    if (def.type == 'str' || def.type == 'buffer') {
      realSize = val.readUInt32LE();
      debug(`unpack ${def.name} of type ${def.type} size ${realSize}/${def.size}`);
      if (realSize) {
        if (def.type == 'str') {
          unpackedValue = val.toString('utf8', 4, 4 + realSize);
        } else {
          unpackedValue = val.subarray(4, 4 + realSize);
        }
      } else {  // the string was a buffer
        unpackedValue = val.subarray(4);
      }
      realSize += 4;
    } else {
      debug(`unpack ${def.name} of type ${def.type} size -/${def.size}`);
      const packMeth = `read${def.type}`;
      if (val[packMeth]) {
        unpackedValue = val[packMeth]();
      } else {
        throw new Error(`Invalid type ${def.type} (Buffer has not method '${packMeth}'.`);
      }
    }
    return [unpackedValue, realSize];
  }

  toJSON(data) {
    const values = this.unpack(data);
    const obj = {};
    this._fields.forEach((def, n) => obj[def.name] = values[n]);
    return obj;
  }

  fromJSON(obj) {
    const values = [];
    this._fields.forEach((def) => values.push(obj[def.name]));
    return this.pack(values);
  }

  get size() {
    if (!this._size) {
      this._size = this._fields.reduce((a,b)=>{
        return {size: a.size+b.size};
      }
      ,{size:0}).size;
    }
    return this._size;  
  }
}


if (require.main == module) {
  const print = console.log.bind(console);
  print("Running tests ...");

  const struct = new BufferStructType([
    {name: 'title', type: 'str', size: 20},
    {name: 'offset', type: 'uint'},
    {name: 'myFloat', type: 'float'},
    {name: 'myDouble', type: 'float'},
    {name: 'smallInt', type: 'int', size: 1},
    {name: 'data', type: 'buffer', size: 20},
    {name: 'payload', type: 'buffer', size: 0},

  ])

  const data = {
    title: 'pokus',
    data: Buffer.from([10, 13, 0, 45]),
    offset: 10,
    myFloat: 10.5,
    myDouble: 124132412,
    smallInt: 30,
    payload: Buffer.from('012345678901', 'ascii'),
  }

  print('>', data);

  const buf = struct.fromJSON(data);
  print('-----', buf.toString('hex'), '-----');

  
  print('<', struct.toJSON(buf));
}

module.exports = {
  BufferStructType: BufferStructType,
  BufferStruct: BufferStruct,
  InvalidValueError: InvalidValueError,
}
