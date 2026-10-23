const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./helpers/load-source.cjs');
const { encodeTOON } = require('../src/utils/toon.ts');

// These examples exercise the interchange syntax, independently of the encoder's helpers.
test('TOON primitive arrays declare their length rather than becoming a string value', () => {
  assert.equal(encodeTOON({ values: [0, false, null, 'true', 'a,b'] }), 'values[5]: 0,false,null,"true","a,b"');
  assert.equal(encodeTOON([0, false]), '[2]: 0,false');
  assert.equal(encodeTOON([]), '[]');
});

test('TOON table cells distinguish null, empty strings, booleans, numbers and numeric strings', () => {
  assert.equal(encodeTOON({ rows: [{ value: null }, { value: '' }, { value: false }, { value: 0 }, { value: 'true' }, { value: '0' }] }),
    'rows[6]{value}:\n  null\n  ""\n  false\n  0\n  "true"\n  "0"');
});

test('TOON nested array and object cells retain structure through a list representation', () => {
  assert.equal(encodeTOON({ rows: [{ stars: ['甲', '乙'], properties: { x: 0 } }] }),
    'rows[1]:\n  - stars[2]: "甲","乙"\n    properties:\n      x: 0');
  assert.equal(encodeTOON({ values: [{}, [1, null], { a: 1, b: { c: false } }] }),
    'values[3]:\n  -\n  - [2]: 1,null\n  - a: 1\n    b:\n      c: false');
});

test('TOON special keys and quoted text cannot turn values into fields or rows', () => {
  assert.equal(encodeTOON({ '中文:数组': [{ 'a,b': '引号"\\\n\r\t\b\f', value: null }] }),
    '"中文:数组"[1]{"a,b",value}:\n  "引号\\"\\\\\\n\\r\\t\\u0008\\u000c",null');
});

test('TOON follows JSON normalization for omitted fields, array holes and dates', () => {
  assert.equal(encodeTOON({ absent: undefined, values: [undefined, NaN, Infinity], date: new Date('2021-06-15T00:42:00Z') }),
    'values[3]: null,null,null\ndate: "2021-06-15T00:42:00.000Z"');
});
