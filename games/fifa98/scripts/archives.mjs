/**
 * Read-only indexes for the EA containers observed on the supplied PS1 disc.
 * Format reference: https://psx-spx.consoledev.net/cdromfileformats/
 * (Electronic Arts 32bit BIGF / 24bit C0FB archives and .PSH textures).
 *
 * This module never writes files, decompresses assets, or interprets roster data.
 * BIGF's declared size can exclude alignment padding, so each data range is
 * checked against the actual container independently. C0FB trailers/checksums
 * are not interpreted or claimed to have been verified.
 */

function bytesAndView(input) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('EA archive input must be a Uint8Array');
  }
  return { bytes: input, view: new DataView(input.buffer, input.byteOffset, input.byteLength) };
}

function magicAt(bytes, offset, text) {
  return offset + text.length <= bytes.length
    && [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function invalid(message) {
  throw new Error(`Invalid EA archive: ${message}`);
}

/** Validate member paths before any caller considers materializing them. */
function validateMemberName(name) {
  if (!name || /[\\:\x00-\x1f\x7f-\uffff]/u.test(name)
    || name.startsWith('/')
    || name.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    invalid(`unsafe member name ${JSON.stringify(name)}`);
  }
}

function readName(bytes, start, headerSize) {
  let end = start;
  while (end < headerSize && bytes[end] !== 0) end += 1;
  if (end === headerSize) invalid('member name is not terminated within the header');
  let name = '';
  for (let index = start; index < end; index += 1) {
    name += String.fromCharCode(bytes[index]);
  }
  validateMemberName(name);
  return { name, next: end + 1 };
}

function finishIndex({ format, declaredSize, headerSize, entries, byteLength }) {
  if (declaredSize !== null && declaredSize < headerSize + entries.reduce((sum, entry) => sum + entry.size, 0)) {
    invalid('BIGF declared size is smaller than the unpadded contents');
  }
  const names = new Set();
  for (const entry of entries) {
    const canonicalName = entry.name.toLowerCase();
    if (names.has(canonicalName)) invalid(`duplicate member name ${JSON.stringify(entry.name)}`);
    names.add(canonicalName);
    if (entry.offset < headerSize || entry.offset > byteLength
      || entry.size > byteLength - entry.offset) {
      invalid(`member ${JSON.stringify(entry.name)} is outside the data area`);
    }
  }

  // Validate in offset order without changing the archive's original index order.
  const nonempty = entries.filter((entry) => entry.size > 0)
    .sort((left, right) => left.offset - right.offset);
  for (let index = 1; index < nonempty.length; index += 1) {
    const previous = nonempty[index - 1];
    if (previous.offset + previous.size > nonempty[index].offset) {
      invalid(`overlapping members ${JSON.stringify(previous.name)} and ${JSON.stringify(nonempty[index].name)}`);
    }
  }

  // Also reject file/directory collisions before extraction to a filesystem.
  for (const entry of entries) {
    const components = entry.name.toLowerCase().split('/');
    components.pop();
    while (components.length) {
      if (names.has(components.join('/'))) invalid(`member path conflicts with a file: ${JSON.stringify(entry.name)}`);
      components.pop();
    }
  }

  return Object.freeze({
    format,
    declaredSize,
    headerSize,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
}

/** Parse named BIGF members. BIGH and BIG4 variants are deliberately unsupported. */
export function parseBigf(input) {
  const { bytes, view } = bytesAndView(input);
  if (bytes.length < 16) invalid('truncated BIGF header');
  if (!magicAt(bytes, 0, 'BIGF')) invalid('expected BIGF signature');
  const declaredSize = view.getUint32(4, false);
  const count = view.getUint32(8, false);
  const headerSize = view.getUint32(12, false);
  if (headerSize < 16 || headerSize > bytes.length) invalid('BIGF header size is out of bounds');
  if (declaredSize < headerSize || declaredSize > bytes.length) invalid('BIGF declared size is out of bounds');
  if (count > Math.floor((headerSize - 16) / 9)) invalid('BIGF entry count exceeds the header');

  const entries = [];
  let cursor = 16;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 9 > headerSize) invalid('truncated BIGF index entry');
    const offset = view.getUint32(cursor, false);
    const size = view.getUint32(cursor + 4, false);
    const { name, next } = readName(bytes, cursor + 8, headerSize);
    entries.push({ name, offset, size });
    cursor = next;
  }
  return finishIndex({ format: 'BIGF', declaredSize, headerSize, entries, byteLength: bytes.length });
}

function uint24(bytes, offset) {
  return bytes[offset] * 0x10000 + bytes[offset + 1] * 0x100 + bytes[offset + 2];
}

/** Parse the C0FB 24-bit index used by most .BIG files on this FIFA98 disc. */
export function parseC0fb(input) {
  const { bytes, view } = bytesAndView(input);
  if (bytes.length < 6) invalid('truncated C0FB header');
  if (bytes[0] !== 0xc0 || bytes[1] !== 0xfb) invalid('expected C0FB signature');
  const headerSize = view.getUint16(2, false) + 4;
  const count = view.getUint16(4, false);
  if (headerSize < 6 || headerSize > bytes.length) invalid('C0FB header size is out of bounds');
  if (count > Math.floor((headerSize - 6) / 7)) invalid('C0FB entry count exceeds the header');

  const entries = [];
  let cursor = 6;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 7 > headerSize) invalid('truncated C0FB index entry');
    const offset = uint24(bytes, cursor);
    const size = uint24(bytes, cursor + 3);
    const { name, next } = readName(bytes, cursor + 6, headerSize);
    entries.push({ name, offset, size });
    cursor = next;
  }
  return finishIndex({ format: 'C0FB', declaredSize: null, headerSize, entries, byteLength: bytes.length });
}

/** Detect and validate a supported archive by its bytes, independent of its name. */
export function parseEaArchive(input) {
  const { bytes } = bytesAndView(input);
  if (magicAt(bytes, 0, 'BIGF')) return parseBigf(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xc0 && bytes[1] === 0xfb) return parseC0fb(bytes);
  throw new Error('Unsupported EA archive signature; supported formats are BIGF and C0FB');
}

/**
 * Return an independent copy of an indexed member; no filesystem writes occur.
 * Entry objects must match a real index member, preventing arbitrary range reads.
 */
export function readEaEntry(input, entryOrName) {
  const archive = parseEaArchive(input);
  const name = typeof entryOrName === 'string' ? entryOrName : entryOrName?.name;
  if (typeof name !== 'string') throw new TypeError('An EA member name or index entry is required');
  const entry = archive.entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`EA archive member not found: ${JSON.stringify(name)}`);
  if (typeof entryOrName !== 'string'
    && (entryOrName.offset !== entry.offset || entryOrName.size !== entry.size)) {
    throw new Error(`EA archive member does not match the validated index: ${JSON.stringify(name)}`);
  }
  return Uint8Array.from(input.subarray(entry.offset, entry.offset + entry.size));
}

/**
 * Classify observed signatures and conservatively label filename candidates.
 * A database/texture signature does not establish a roster or kit field schema.
 */
export function identifyResource(input, name = '') {
  const { bytes } = bytesAndView(input);
  const signatureHex = [...bytes.subarray(0, 16)].map((value) => value.toString(16).padStart(2, '0')).join('');
  const signature = [...bytes.subarray(0, 8)].map((value) => value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : '.').join('');
  const result = (kind, format, evidence = 'signature') => ({ signature, signatureHex, kind, format, evidence });
  if (magicAt(bytes, 0, 'BIGF')) return result('archive', 'BIGF');
  if (bytes.length >= 2 && bytes[0] === 0xc0 && bytes[1] === 0xfb) return result('archive', 'C0FB');
  if (magicAt(bytes, 0, 'PS-X EXE')) return result('executable', 'PS-X EXE');
  if (magicAt(bytes, 0, 'SHPP') && magicAt(bytes, 12, 'GIMX')) return result('texture-container', 'SHPP');
  for (const databaseFormat of ['FCDB', 'STR0', 'STR1']) {
    if (magicAt(bytes, 0, databaseFormat)) return result('database-candidate', databaseFormat);
  }
  for (const audioFormat of ['BNKl', 'SCHl', 'MIDx']) {
    if (magicAt(bytes, 0, audioFormat)) return result('audio-candidate', audioFormat);
  }
  const basename = String(name).split('/').at(-1);
  if (/^(?:BE|FE)CODE\.BIN$/iu.test(basename)) return result('code-candidate', null, 'filename');
  if (/\.dbi$/iu.test(basename)) return result('database-candidate', null, 'filename');
  if (/\.psh$/iu.test(basename)) return result('texture-candidate', null, 'filename');
  if (/\.xa$/iu.test(basename)) return result('audio-candidate', null, 'filename');
  return result('unknown', null, 'unknown');
}
