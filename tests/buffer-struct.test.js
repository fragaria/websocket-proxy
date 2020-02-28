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

test('unpacked equals packed', t => {

  const struct = new BufferStructType([
    {name: 'title', type: 'str', size: 20},
    {name: 'offset', type: 'uint'},
    {name: 'myFloat', type: 'float'},
    {name: 'myBigFloat', type: 'float', size: 8}, // will be converted to double
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
    myBigFloat: 235132412,
    myDouble: 124132412,
    smallInt: 30,
    payload: Buffer.from('012345678901', 'ascii'),
  }

  const packed = struct.fromJSON(data);

  t.deepEqual(packed.toJSON(), data);
  t.deepEqual(packed.unpack(), struct._fields.map((field)=>data[field.name]));
});

test('error on duplicate field definition', t => {
  t.throws(()=>new BufferStructType([
    {name: 'some-name', type: 'float'},
    {name: 'some-name', type: 'int'},
  ]),
  {message: /duplicate field/});
});


test('error on invalid type', t => {
  t.throws(
    ()=>new BufferStructType([ {name: 'some-name', type: 'an-invalid-type'}, ]),
    {message: /an-invalid-type/}
  );
});


test('error on invalid size', t => {
  t.throws(
    ()=>new BufferStructType([ {name: 'some-name', type: 'str', size: 'ten'}, ]),
    {message: /some-name/}
  );
  t.throws(
    ()=>new BufferStructType([ {name: 'some-name', type: 'str'}, {name: 'x', type: 'int'}]),

    {message: /some-name/}
  );
});



test('non-string is converted automatically', t => {
  const struct = new BufferStructType([ {name: 'name', type: 'str', size: 10}, ]),
        packed = struct.fromJSON({
          name: 1,
        });
  t.is(packed.toJSON().name, '1');
});

test('size overflow throws an error for string', t => {
  const struct = new BufferStructType([ {name: 'name', type: 'str', size: 10}, ]),
        pack = ()=>struct.fromJSON({ name: 'x'.repeat(7), });
  t.throws(pack, {instanceOf: InvalidValueError, message: /too long/});
});
