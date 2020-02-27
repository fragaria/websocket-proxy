//-- vim: ft=javascript tabstop=2 softtabstop=2 expandtab shiftwidth=2
'use strict';
const test = require('ava');
const { BufferStruct, BufferStructType, InvalidValueError } = require('../lib/buffer-struct');

test('packs string', t => {
  const type = new BufferStructType([{name: 'title', type: 'str', size: 20 }]),
        value = 'test string',
        packed = type.fromJSON({title: value}),
        unpacked = packed.toJSON();
  t.deepEqual(unpacked,
    {title: value},
    'the unpacked value equals to the original');
  t.assert(
    packed instanceof BufferStruct,
    'packed value is an enhanced Buffer');
  t.is(
    packed.length, value.length + 4,
    `lenght of packed struct is the lenght of the string plus lenght
    information itself (the real length is not the maximum lenght specified in
    type definition)`);
  t.throws(()=>type.pack(['some rather longer string which could not fit in the type defined']),
    {instanceOf: InvalidValueError},
    'throws an error on too long String'
  );
  t.throws(()=>type.pack([Buffer.from('some rather longer string which could not fit in the type defined')]),
    {instanceOf: InvalidValueError},
    'throws an error on too Buffer'
  );
});

test('Buffer-struct packs and unpacks', t => {

  const struct = new BufferStructType([
    {name: 'title', type: 'str', size: 20},
    {name: 'offset', type: 'uint'},
    {name: 'myFloat', type: 'float'},
    {name: 'myDouble', type: 'double'},
    {name: 'smallInt', type: 'int', size: 1},
    {name: 'data', type: 'buffer', size: 20},
    // last piece of struct can have size=0 meaning the resulting data will be
    // enlarged based on actual data being packed
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

  const packed = struct.fromJSON(data);

  t.deepEqual(packed.toJSON(), data);
});
