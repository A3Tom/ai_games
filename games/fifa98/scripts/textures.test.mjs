import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePsh, decompressRefPack } from './textures.mjs';

// All fixtures contain invented pixels and commands, never commercial assets.
function refpack(size, body) {
  const header = Buffer.from([0x10, 0xfb, 0, 0, 0]);
  header.writeUIntBE(size, 2, 3);
  return Buffer.concat([header, Buffer.from(body)]);
}

function literalCommands(data) {
  const parts = [];
  let cursor = 0;
  while (data.length - cursor >= 4) {
    const length = Math.min(112, Math.floor((data.length - cursor) / 4) * 4);
    parts.push(Buffer.from([0xe0 + length / 4 - 1]), data.subarray(cursor, cursor + length));
    cursor += length;
  }
  return { parts, remaining: data.subarray(cursor) };
}

function literalRefpack(data) {
  const { parts, remaining } = literalCommands(data);
  return refpack(data.length, Buffer.concat([...parts, Buffer.from([0xfc + remaining.length]), remaining]));
}

function paletteWords(count) {
  const words = new Uint16Array(count);
  words[1] = 0x001f;
  words[2] = 0x03e0;
  words[3] = 0x7c00;
  words[4] = 0x8000;
  words[count - 1] = 0xffff;
  return words;
}

function texture({ name = 'test', width = 3, height = 2, bits = 4,
  pixels = Buffer.from([0x21, 0xf3, 0x40, 0xee]), compressed = false,
  palette = bits === 16 ? null : paletteWords(1 << bits), comment = false } = {}) {
  const data = compressed ? literalRefpack(pixels) : pixels;
  const bitmap = Buffer.alloc(16 + Math.ceil(data.length / 4) * 4);
  bitmap[0] = (bits === 4 ? 0x40 : bits === 8 ? 0x41 : 0x42) | (compressed ? 0x80 : 0);
  bitmap.writeUInt16LE(width, 4);
  bitmap.writeUInt16LE(height, 6);
  bitmap.writeUInt16LE(9, 8);
  bitmap.writeUInt16LE(10, 10);
  bitmap.writeUInt16LE(0x300c, 12);
  bitmap.writeUInt16LE(13, 14);
  bitmap.set(data, 16);
  const chunks = [bitmap];
  if (palette) {
    const colours = Buffer.alloc(16 + palette.length * 2);
    colours[0] = 0x23;
    colours.writeUInt16LE(palette.length, 4);
    colours.writeUInt16LE(1, 6);
    palette.forEach((word, index) => colours.writeUInt16LE(word, 16 + index * 2));
    chunks.push(colours);
  }
  if (comment) chunks.push(Buffer.from([0x6f, 0, 0, 0, 65, 66, 67, 0]));
  chunks.forEach((chunk, index) => {
    if (index + 1 < chunks.length) chunk.writeUIntLE(chunk.length, 1, 3);
  });
  return { name, bytes: Buffer.concat(chunks) };
}

function psh(textures = [texture()], { order = textures.map((_, index) => index), minus12 = false } = {}) {
  const headerSize = 16 + textures.length * 8;
  const offsets = [];
  let length = headerSize;
  for (const item of textures) { offsets.push(length); length += item.bytes.length; }
  const bytes = Buffer.alloc(length + (minus12 ? 12 : 0));
  bytes.write('SHPP');
  bytes.writeUInt32LE(length, 4);
  bytes.writeUInt32LE(textures.length, 8);
  bytes.write('GIMX', 12);
  order.forEach((source, index) => {
    bytes.write(textures[source].name, 16 + index * 8, 4, 'ascii');
    bytes.writeUInt32LE(offsets[source], 20 + index * 8);
  });
  textures.forEach((item, index) => bytes.set(item.bytes, offsets[index]));
  if (minus12) {
    bytes.write('CRCF', length);
    bytes.writeUInt32LE(12, length + 4);
  }
  return { bytes, offsets, headerSize };
}

test('RefPack literal runs, final literals, and empty streams', () => {
  for (const length of [0, 1, 2, 3, 4, 7, 112, 116]) {
    const expected = Buffer.from(Array.from({ length }, (_, index) => index & 255));
    const input = literalRefpack(expected);
    const result = decompressRefPack(input);
    assert.deepEqual(result.data, Uint8Array.from(expected));
    assert.equal(result.bytesRead, input.length);
    assert.equal(result.declaredSize, expected.length);
  }
  const input = Buffer.concat([literalRefpack(Buffer.from('abc')), Buffer.alloc(3, 0xaa)]);
  const result = decompressRefPack(input);
  assert.equal(result.bytesRead, input.length - 3);
  input.fill(0);
  assert.equal(Buffer.from(result.data).toString(), 'abc');
});

test('RefPack independently specified short, medium and long references', () => {
  const cases = [
    { expected: 'ABCDABC', commands: [0xe0, 65, 66, 67, 68, 0x00, 0x03, 0xfc] },
    { expected: 'ABCCCC', commands: [0x03, 0x00, 65, 66, 67, 0xfc] },
    { expected: 'ABCDABCD', commands: [0xe0, 65, 66, 67, 68, 0x80, 0x00, 0x03, 0xfc] },
    { expected: 'ABCCCCC', commands: [0x80, 0xc0, 0x00, 65, 66, 67, 0xfc] },
    { expected: 'ABCDABCDA', commands: [0xe0, 65, 66, 67, 68, 0xc0, 0x00, 0x03, 0x00, 0xfc] },
    { expected: 'ABCCCCCC', commands: [0xc3, 0x00, 0x00, 0x00, 65, 66, 67, 0xfc] },
  ];
  for (const item of cases) {
    assert.equal(Buffer.from(decompressRefPack(refpack(item.expected.length, item.commands)).data).toString(), item.expected);
  }
  const longest = refpack(1032, [0xe0, 65, 65, 65, 65, 0xcc, 0, 0, 255, 0xfc]);
  assert.deepEqual(decompressRefPack(longest).data, new Uint8Array(1032).fill(65));
});

test('RefPack displacement high bits and maximum distances', () => {
  for (const [distance, command, matchLength] of [
    [1024, [0x60, 0xff], 3],
    [16384, [0x80, 0x3f, 0xff], 4],
    [131072, [0xd0, 0xff, 0xff, 0], 5],
  ]) {
    const prefix = Buffer.from(Array.from({ length: distance }, (_, index) => index & 255));
    const { parts, remaining } = literalCommands(prefix);
    assert.equal(remaining.length, 0);
    const input = refpack(distance + matchLength, Buffer.concat([...parts, Buffer.from(command), Buffer.from([0xfc])]));
    const expected = Uint8Array.from(Buffer.concat([prefix, prefix.subarray(0, matchLength)]));
    assert.deepEqual(decompressRefPack(input).data, expected);
  }
});

test('RefPack rejects corrupt streams, unsafe sizes, and unsupported methods', () => {
  assert.throws(() => decompressRefPack(new Uint8Array(4)), /truncated/);
  const unsupported = literalRefpack(Buffer.from('a'));
  unsupported[0] = 0x90;
  assert.throws(() => decompressRefPack(unsupported), /Unsupported RefPack/);
  assert.throws(() => decompressRefPack(refpack(4, [0x80])), /truncated/);
  assert.throws(() => decompressRefPack(refpack(3, [0xff, 65])), /truncated/);
  assert.throws(() => decompressRefPack(refpack(1, [0xe0, 65, 66, 67, 68, 0xfc])), /exceeds the declared/);
  assert.throws(() => decompressRefPack(refpack(3, [0, 0, 0xfc])), /back-reference/);
  assert.throws(() => decompressRefPack(refpack(3, [0xfc])), /end marker precedes/);
  assert.throws(() => decompressRefPack(refpack(4, [0xe0, 65, 66, 67, 68])), /truncated/);
  assert.throws(() => decompressRefPack(literalRefpack(Buffer.from('abc')), { maxOutputBytes: 2 }), /configured limit/);
  assert.throws(() => decompressRefPack(new ArrayBuffer(8)), /Uint8Array/);
  for (const limit of [0, -1, NaN, Infinity, 1.5, 257 * 1024 * 1024]) {
    assert.throws(() => decompressRefPack(refpack(0, [0xfc]), { maxOutputBytes: limit }), /positive integer/);
  }
});

test('SHPP 4bpp decoding preserves pixel order, palette words, STP and metadata', () => {
  const { bytes } = psh();
  const before = Buffer.from(bytes);
  const result = decodePsh(bytes);
  assert.equal(result.format, 'SHPP');
  const item = result.textures[0];
  assert.equal(item.width, 3);
  assert.equal(item.height, 2);
  assert.equal(item.bitsPerPixel, 4);
  assert.equal(item.compressed, false);
  assert.equal(item.name, 'test');
  assert.deepEqual([...item.indices], [1, 2, 3, 0, 4, 14]);
  assert.deepEqual([...item.rgba], [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
  assert.deepEqual([...item.stp], [0, 0, 0, 0, 1, 0]);
  assert.equal(item.palette[4], 0x8000);
  assert.deepEqual([item.centerX, item.centerY, item.positionX, item.positionY], [9, 10, 0x300c, 13]);
  assert.equal(item.chunks.length, 2);
  item.rgba.fill(0);
  item.stp.fill(0);
  item.palette.fill(0);
  item.indices.fill(0);
  assert.deepEqual(bytes, before, 'decoded output must be independent of the source');
});

test('SHPP 4bpp and 8bpp odd widths skip each padded scanline correctly', () => {
  const single = decodePsh(psh([texture({ width: 1, height: 2, pixels: Buffer.from([1, 0xaa, 2, 0xbb]) })]).bytes).textures[0];
  assert.deepEqual([...single.indices], [1, 2]);
  const eight = decodePsh(psh([texture({ bits: 8, pixels: Buffer.from([1, 2, 3, 0xaa, 0, 4, 255, 0xbb]) })]).bytes).textures[0];
  assert.deepEqual([...eight.indices], [1, 2, 3, 0, 4, 255]);
  assert.deepEqual([...eight.rgba.subarray(-4)], [255, 255, 255, 255]);
  assert.equal(eight.stp.at(-1), 1);
});

test('SHPP direct 16bit colour decodes without a palette or invented blend alpha', () => {
  const words = [0, 0x001f, 0x03e0, 0x7c00, 0x8000, 0xc210];
  const pixels = Buffer.alloc(words.length * 2);
  words.forEach((word, index) => pixels.writeUInt16LE(word, index * 2));
  const item = decodePsh(psh([texture({ width: 3, height: 2, bits: 16, pixels })]).bytes).textures[0];
  assert.equal(item.palette, null);
  assert.equal(item.indices, null);
  assert.equal(item.bitsPerPixel, 16);
  assert.deepEqual([...item.stp], [0, 0, 0, 0, 1, 1]);
  assert.deepEqual([...item.rgba.subarray(-4)], [132, 132, 132, 255]);
});

test('SHPP RefPack 4bpp/8bpp bitmaps decode identically to uncompressed pixels', () => {
  for (const bits of [4, 8]) {
    const pixels = bits === 4 ? Buffer.from([0x21, 0xf3, 0x40, 0xee]) : Buffer.from([1, 2, 3, 0xaa, 0, 4, 255, 0xbb]);
    const plain = decodePsh(psh([texture({ bits, pixels })]).bytes).textures[0];
    const compressed = decodePsh(psh([texture({ bits, pixels, compressed: true, comment: true })]).bytes).textures[0];
    assert.equal(compressed.compressed, true);
    assert.deepEqual(compressed.rgba, plain.rgba);
    assert.deepEqual(compressed.indices, plain.indices);
    assert.deepEqual(compressed.stp, plain.stp);
    assert.equal(compressed.chunks[2].type, 0x6f);
  }
});

test('SHPP accepts unsorted offsets, duplicate mipmap names, and size-minus-12 headers', () => {
  const { bytes, offsets } = psh([texture({ name: 'same' }), texture({ name: 'same', width: 1, height: 1, pixels: Buffer.from([1, 0]) })], { order: [1, 0], minus12: true });
  const result = decodePsh(bytes);
  assert.equal(result.textures.length, 2);
  assert.deepEqual(result.textures.map((item) => item.offset), [offsets[1], offsets[0]]);
  assert.deepEqual(result.textures.map((item) => item.name), ['same', 'same']);
  assert.deepEqual(result.textures.map((item) => item.width), [1, 3]);
  assert.deepEqual(result.trailer, { signature: 'CRCF', offset: bytes.length - 12, size: 12, checksumVerified: false });
  const wrapped = new Uint8Array(bytes.length + 10).fill(0xff);
  wrapped.set(bytes, 3);
  assert.deepEqual(decodePsh(wrapped.subarray(3, 3 + bytes.length)).textures[1].rgba, result.textures[1].rgba);
  const badTrailer = Buffer.from(bytes); badTrailer[bytes.length - 12] = 0;
  assert.throws(() => decodePsh(badTrailer), /CRCF trailer/);
  const wrongTrailerSize = Buffer.from(bytes); wrongTrailerSize.writeUInt32LE(11, bytes.length - 8);
  assert.throws(() => decodePsh(wrongTrailerSize), /CRCF trailer/);
});

test('SHPP rejects bad headers, indices, identifiers and duplicate root offsets', () => {
  const { bytes, headerSize } = psh([texture(), texture({ name: 'more' })]);
  assert.throws(() => decodePsh(new Uint8Array(15)), /SHPP\/GIMX/);
  const badMagic = Buffer.from(bytes); badMagic[12] = 0;
  assert.throws(() => decodePsh(badMagic), /SHPP\/GIMX/);
  const badSize = Buffer.from(bytes); badSize.writeUInt32LE(bytes.length + 1, 4);
  assert.throws(() => decodePsh(badSize), /declared file size/);
  const count = Buffer.from(bytes); count.writeUInt32LE(0xffffffff, 8);
  assert.throws(() => decodePsh(count), /texture count/);
  const duplicate = Buffer.from(bytes); duplicate.writeUInt32LE(duplicate.readUInt32LE(20), 28);
  assert.throws(() => decodePsh(duplicate), /same bitmap/);
  for (const offset of [0, headerSize - 1, bytes.length - 15, 0xffffffff]) {
    const badOffset = Buffer.from(bytes); badOffset.writeUInt32LE(offset, 20);
    assert.throws(() => decodePsh(badOffset), /offset is out of bounds/);
  }
  for (const name of [Buffer.from([65, 0, 66, 0]), Buffer.from([0, 0, 0, 0]), Buffer.from([65, 255, 66, 0])]) {
    const badName = Buffer.from(bytes); badName.set(name, 16);
    assert.throws(() => decodePsh(badName), /identifier/);
  }
});

test('SHPP rejects malformed dimensions, palette formats, chunks and links', () => {
  const { bytes, offsets } = psh();
  const root = offsets[0];
  for (const width of [0, 0xffff]) {
    const badWidth = Buffer.from(bytes); badWidth.writeUInt16LE(width, root + 4);
    assert.throws(() => decodePsh(badWidth), /pixel limit|truncated/);
  }
  const palette = root + bytes.readUIntLE(root + 1, 3);
  for (const [relative, value] of [[4, 15], [6, 2]]) {
    const badPalette = Buffer.from(bytes); badPalette.writeUInt16LE(value, palette + relative);
    assert.throws(() => decodePsh(badPalette), /16x1 PS1 palette/);
  }
  assert.throws(() => decodePsh(psh([texture({ palette: null })]).bytes), /no palette/);
  for (const type of [0xc2, 0x6b, 0xff]) {
    const unknown = Buffer.from(bytes); unknown[root] = type;
    assert.throws(() => decodePsh(unknown), /Unsupported PSH chunk/);
  }
  const twoBitmaps = Buffer.from(bytes); twoBitmaps[palette] = 0x41;
  assert.throws(() => decodePsh(twoBitmaps), /exactly one bitmap/);
  const commentFirst = Buffer.from(bytes); commentFirst[root] = 0x6f;
  assert.throws(() => decodePsh(commentFirst), /comment precedes/);
  for (const displacement of [1, bytes.length - root, 0xffffff]) {
    const badLink = Buffer.from(bytes); badLink.writeUIntLE(displacement, root + 1, 3);
    assert.throws(() => decodePsh(badLink), /chunk link/);
  }
  const shortHeader = Buffer.from(bytes); shortHeader.writeUIntLE(8, root + 1, 3);
  assert.throws(() => decodePsh(shortHeader), /truncated bitmap header/);
});

test('SHPP rejects payloads crossing the next texture and inconsistent RefPack sizes', () => {
  const { bytes, offsets } = psh([texture(), texture({ name: 'more' })]);
  const crossing = Buffer.from(bytes); crossing.writeUIntLE(offsets[1] - offsets[0], offsets[0] + 1, 3);
  assert.throws(() => decodePsh(crossing), /chunk link/);
  const missingData = psh([texture({ pixels: Buffer.from([1]) })]).bytes;
  missingData.writeUInt16LE(20, missingData.readUInt32LE(20) + 6);
  assert.throws(() => decodePsh(missingData), /truncated or crosses/);
  const compressed = psh([texture({ compressed: true })]);
  compressed.bytes[compressed.offsets[0] + 20] = 3;
  assert.throws(() => decodePsh(compressed.bytes), /output size|declared output size/);
  const trailing = texture();
  trailing.bytes = Buffer.concat([trailing.bytes, Buffer.alloc(8)]);
  assert.throws(() => decodePsh(psh([trailing]).bytes), /unexplained trailing bytes/);
});

test('SHPP enforces count, decoded-byte and pixel budgets and validates options', () => {
  const { bytes } = psh([texture(), texture({ name: 'more' })]);
  assert.throws(() => decodePsh(bytes, { maxTextures: 1 }), /texture count/);
  assert.throws(() => decodePsh(bytes, { maxPixels: 5 }), /pixel limit/);
  assert.throws(() => decodePsh(bytes, { maxDecodedBytes: 100 }), /byte limit/);
  assert.throws(() => decodePsh(new ArrayBuffer(16)), /Uint8Array/);
  for (const option of ['maxTextures', 'maxPixels', 'maxDecodedBytes']) {
    for (const limit of [0, -1, NaN, Infinity, 1.5]) {
      assert.throws(() => decodePsh(bytes, { [option]: limit }), /positive integer/);
    }
  }
});
