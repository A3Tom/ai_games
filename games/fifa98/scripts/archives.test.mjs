import assert from 'node:assert/strict';
import test from 'node:test';
import { identifyResource, parseBigf, parseC0fb, parseEaArchive, readEaEntry } from './archives.mjs';

const align4 = (number) => Math.ceil(number / 4) * 4;

// All fixtures are invented; no game assets are required or written.
function makeArchive(format, members, { gap = 0, trailer = 0 } = {}) {
  const prefixSize = format === 'BIGF' ? 16 : 6;
  const fieldsSize = format === 'BIGF' ? 8 : 6;
  const headerSize = prefixSize + members.reduce((sum, member) => sum + fieldsSize + member.name.length + 1, 0);
  let end = align4(headerSize);
  const ranges = members.map((member) => {
    const range = { offset: end, size: member.data.length };
    end += member.data.length + gap;
    return range;
  });
  const bytes = Buffer.alloc(end + trailer);
  if (format === 'BIGF') {
    bytes.write('BIGF');
    bytes.writeUInt32BE(headerSize + members.reduce((sum, member) => sum + member.data.length, 0), 4);
    bytes.writeUInt32BE(members.length, 8);
    bytes.writeUInt32BE(headerSize, 12);
  } else {
    bytes.writeUInt16BE(0xc0fb, 0);
    bytes.writeUInt16BE(headerSize - 4, 2);
    bytes.writeUInt16BE(members.length, 4);
  }
  let cursor = prefixSize;
  const indexPositions = [];
  members.forEach((member, index) => {
    indexPositions.push(cursor);
    const { offset, size } = ranges[index];
    if (format === 'BIGF') {
      bytes.writeUInt32BE(offset, cursor);
      bytes.writeUInt32BE(size, cursor + 4);
    } else {
      bytes.writeUIntBE(offset, cursor, 3);
      bytes.writeUIntBE(size, cursor + 3, 3);
    }
    bytes.write(member.name, cursor + fieldsSize, 'latin1');
    cursor += fieldsSize + member.name.length + 1;
    bytes.set(member.data, offset);
  });
  return { bytes, headerSize, ranges, indexPositions };
}

const members = [
  { name: 'assets/body.psh', data: Buffer.from('invented texture') },
  { name: 'fcdb.dbi', data: Buffer.from('invented database') },
];

for (const format of ['BIGF', 'C0FB']) {
  const parse = format === 'BIGF' ? parseBigf : parseC0fb;

  test(`${format}: indexes and copies members, including padding and relative directories`, () => {
    const fixture = makeArchive(format, members, { gap: 3, trailer: 12 });
    const before = Buffer.from(fixture.bytes);
    const archive = parseEaArchive(fixture.bytes);
    assert.equal(archive.format, format);
    assert.equal(archive.headerSize, fixture.headerSize);
    assert.equal(archive.entries.length, 2);
    assert.equal(archive.declaredSize, format === 'BIGF'
      ? fixture.headerSize + members.reduce((sum, member) => sum + member.data.length, 0)
      : null);
    archive.entries.forEach((entry, index) => {
      assert.deepEqual(entry, { name: members[index].name, ...fixture.ranges[index] });
      assert.deepEqual(readEaEntry(fixture.bytes, entry), Uint8Array.from(members[index].data));
    });
    const copy = readEaEntry(fixture.bytes, 'fcdb.dbi');
    copy.fill(0);
    assert.deepEqual(fixture.bytes, before, 'returned data must not share mutable storage with the source');
    assert.throws(() => readEaEntry(fixture.bytes, 'missing'), /not found/);
    assert.throws(() => readEaEntry(fixture.bytes, { ...archive.entries[0], offset: 0 }), /does not match/);
    assert.throws(() => readEaEntry(fixture.bytes, null), /name or index entry/);
  });

  test(`${format}: respects Uint8Array byte offsets`, () => {
    const { bytes } = makeArchive(format, members);
    const wrapped = new Uint8Array(bytes.length + 18).fill(0xff);
    wrapped.set(bytes, 7);
    const view = wrapped.subarray(7, 7 + bytes.length);
    assert.equal(parse(view).entries[0].name, members[0].name);
    assert.deepEqual(readEaEntry(view, 'fcdb.dbi'), Uint8Array.from(members[1].data));
  });

  test(`${format}: supports empty archives and empty files`, () => {
    assert.deepEqual(parse(makeArchive(format, []).bytes).entries, []);
    const { bytes } = makeArchive(format, [{ name: 'empty', data: Buffer.alloc(0) }]);
    assert.equal(parse(bytes).entries[0].size, 0);
    assert.equal(readEaEntry(bytes, 'empty').length, 0);
  });

  test(`${format}: rejects truncated headers and impossible header/count values`, () => {
    const { bytes } = makeArchive(format, members);
    assert.throws(() => parse(bytes.subarray(0, 5)), /truncated/);
    const tooLongHeader = Buffer.from(bytes);
    if (format === 'BIGF') tooLongHeader.writeUInt32BE(bytes.length + 1, 12);
    else tooLongHeader.writeUInt16BE(bytes.length, 2);
    assert.throws(() => parse(tooLongHeader), /header size/);
    const tooShortHeader = Buffer.from(bytes);
    if (format === 'BIGF') tooShortHeader.writeUInt32BE(15, 12);
    else tooShortHeader.writeUInt16BE(1, 2);
    assert.throws(() => parse(tooShortHeader), /header size/);
    const tooMany = Buffer.from(bytes);
    if (format === 'BIGF') tooMany.writeUInt32BE(0xffffffff, 8);
    else tooMany.writeUInt16BE(0xffff, 4);
    assert.throws(() => parse(tooMany), /entry count/);
  });

  test(`${format}: rejects truncated names and data, header overlaps and range overlaps`, () => {
    const { bytes, headerSize, indexPositions, ranges } = makeArchive(format, members);
    const unterminated = Buffer.from(bytes);
    unterminated[headerSize - 1] = 0x61;
    assert.throws(() => parse(unterminated), /not terminated/);
    assert.throws(() => parse(bytes.subarray(0, bytes.length - 3)), /out of bounds|outside the data/);
    const wrongOffset = Buffer.from(bytes);
    const writeOffset = (target, value, at) => format === 'BIGF'
      ? target.writeUInt32BE(value, at)
      : target.writeUIntBE(value, at, 3);
    writeOffset(wrongOffset, headerSize - 1, indexPositions[0]);
    assert.throws(() => parse(wrongOffset), /outside the data/);
    const outOfBounds = Buffer.from(bytes);
    writeOffset(outOfBounds, bytes.length, indexPositions[0]);
    assert.throws(() => parse(outOfBounds), /outside the data/);
    const overlap = Buffer.from(bytes);
    writeOffset(overlap, ranges[0].offset + 1, indexPositions[1]);
    assert.throws(() => parse(overlap), /overlapping/);
  });

  test(`${format}: rejects unsafe, duplicate and conflicting member names`, () => {
    for (const name of ['', '/abs', '../escape', 'a/../escape', './file', 'a//b', 'a/',
      'a\\b', 'C:drive', 'a\x1fb', 'a\x7fb', 'a\x80b']) {
      const fixture = makeArchive(format, [{ name, data: Buffer.from('x') }]);
      assert.throws(() => parse(fixture.bytes), /unsafe member name/, name);
    }
    const duplicate = makeArchive(format, [
      { name: 'Same', data: Buffer.from('a') },
      { name: 'same', data: Buffer.from('b') },
    ]);
    assert.throws(() => parse(duplicate.bytes), /duplicate member/);
    const conflict = makeArchive(format, [
      { name: 'folder', data: Buffer.from('a') },
      { name: 'Folder/child', data: Buffer.from('b') },
    ]);
    assert.throws(() => parse(conflict.bytes), /conflicts with a file/);
  });
}

test('BIGF: validates the declared size without treating it as a padded data boundary', () => {
  const { bytes, headerSize } = makeArchive('BIGF', members, { gap: 11 });
  assert.ok(parseBigf(bytes).declaredSize < bytes.length);
  for (const size of [0, headerSize, bytes.length + 1]) {
    const bad = Buffer.from(bytes);
    bad.writeUInt32BE(size, 4);
    assert.throws(() => parseBigf(bad), /declared size/);
  }
});

test('archive APIs reject unsupported inputs and variants explicitly', () => {
  assert.throws(() => parseEaArchive(new ArrayBuffer(16)), /Uint8Array/);
  assert.throws(() => parseEaArchive(new Uint8Array()), /Unsupported/);
  for (const magic of ['BIGH', 'BIG4', 'SHPP']) {
    const bytes = Buffer.alloc(32);
    bytes.write(magic);
    assert.throws(() => parseEaArchive(bytes), /Unsupported/);
    assert.throws(() => parseBigf(bytes), /expected BIGF/);
    assert.throws(() => parseC0fb(bytes), /expected C0FB/);
  }
});

test('resource identification records signatures without inventing asset field schemas', () => {
  const bigf = makeArchive('BIGF', members).bytes;
  assert.deepEqual(identifyResource(bigf).kind, 'archive');
  assert.equal(identifyResource(makeArchive('C0FB', members).bytes).format, 'C0FB');
  assert.equal(identifyResource(Buffer.from('PS-X EXE')).kind, 'executable');
  for (const magic of ['FCDB', 'STR0', 'STR1']) {
    assert.equal(identifyResource(Buffer.from(magic)).kind, 'database-candidate');
    assert.equal(identifyResource(Buffer.from(magic)).format, magic);
  }
  const psh = Buffer.alloc(16);
  psh.write('SHPP');
  psh.write('GIMX', 12);
  assert.equal(identifyResource(psh).kind, 'texture-container');
  assert.equal(identifyResource(psh).format, 'SHPP');
  assert.equal(identifyResource(Buffer.from('SHPP')).kind, 'unknown');
  assert.equal(identifyResource(Buffer.from('other'), 'BECODE.BIN').kind, 'code-candidate');
  assert.equal(identifyResource(Buffer.from('other'), 'BECODE.BIN').evidence, 'filename');
  assert.equal(identifyResource(Buffer.from('other'), 'folder/team.dbi').kind, 'database-candidate');
  assert.equal(identifyResource(Buffer.from('other'), 'kit.psh').kind, 'texture-candidate');
  assert.equal(identifyResource(Buffer.from('other'), 'clip.xa').kind, 'audio-candidate');
  assert.equal(identifyResource(Buffer.from('other'), 'misc.bin').evidence, 'unknown');
  for (const magic of ['BNKl', 'SCHl', 'MIDx']) {
    assert.equal(identifyResource(Buffer.from(magic)).kind, 'audio-candidate');
  }
  assert.equal(identifyResource(Uint8Array.from([0, 255, 0x41])).signatureHex, '00ff41');
  assert.equal(identifyResource(Uint8Array.from([0, 255, 0x41])).signature, '..A');
});
