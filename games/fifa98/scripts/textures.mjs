/**
 * Read-only EA SHPP/GIMX texture decoding, independent of a game runtime.
 * Specifications: https://psx-spx.consoledev.net/cdromfileformats/
 * and https://psx-spx.consoledev.net/graphicsprocessingunitgpu/
 *
 * Supported bitmaps: 40h (4bpp), 41h (8bpp), 42h (BGR555/STP), plus
 * C0h/C1h compressed with the 10FBh RefPack method observed on this disc.
 * Palette chunks use 23h; opaque comment chunks use 6Fh. Unknown types fail.
 * RGBA previews use opaque drawing: colour word 0000h is transparent and all
 * other words are opaque. STP bits are returned separately because their actual
 * blend operation depends on the original primitive's GPU drawing settings.
 */

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 1024 * 1024;
const DEFAULT_MAX_TEXTURES = 4096;
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const HARD_OUTPUT_LIMIT = 256 * 1024 * 1024;

function inputBytes(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Texture input must be a Uint8Array');
  if (input.length > MAX_INPUT_BYTES) throw new Error('Texture input exceeds the 64 MiB limit');
  return { bytes: input, view: new DataView(input.buffer, input.byteOffset, input.byteLength) };
}

function positiveLimit(value, fallback, name) {
  const limit = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > HARD_OUTPUT_LIMIT) {
    throw new RangeError(`${name} must be a positive integer no greater than ${HARD_OUTPUT_LIMIT}`);
  }
  return limit;
}

function invalid(message) {
  throw new Error(`Invalid PSH texture: ${message}`);
}

function uint24(bytes, offset) {
  return bytes[offset] * 0x10000 + bytes[offset + 1] * 0x100 + bytes[offset + 2];
}

function magic(bytes, offset, text) {
  return offset + text.length <= bytes.length
    && [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

/**
 * Decode a PS1 10FBh RefPack stream. bytesRead includes its required end marker
 * and excludes any caller-owned alignment padding following that marker.
 */
export function decompressRefPack(input, { maxOutputBytes } = {}) {
  const { bytes } = inputBytes(input);
  const limit = positiveLimit(maxOutputBytes, DEFAULT_MAX_DECODED_BYTES, 'maxOutputBytes');
  if (bytes.length < 5) throw new Error('Invalid RefPack: truncated 10FB header');
  if (bytes[0] !== 0x10 || bytes[1] !== 0xfb) {
    throw new Error('Unsupported RefPack method; this decoder supports PS1 10FB only');
  }
  const declaredSize = uint24(bytes, 2);
  if (declaredSize > limit) throw new Error('Invalid RefPack: declared output exceeds the configured limit');
  const data = new Uint8Array(declaredSize);
  let source = 5;
  let destination = 0;
  function requireInput(length) {
    if (length > bytes.length - source) throw new Error('Invalid RefPack: truncated command or literal data');
  }
  for (;;) {
    requireInput(1);
    const code = bytes[source++];
    let literals;
    let length = 0;
    let distance = 0;
    let end = false;
    if (code < 0x80) {
      requireInput(1);
      literals = code & 3;
      length = ((code & 0x1c) >> 2) + 3;
      distance = ((code & 0x60) << 3) + bytes[source++] + 1;
    } else if (code < 0xc0) {
      requireInput(2);
      const second = bytes[source++];
      literals = second >> 6;
      length = (code & 0x3f) + 4;
      distance = ((second & 0x3f) << 8) + bytes[source++] + 1;
    } else if (code < 0xe0) {
      requireInput(3);
      literals = code & 3;
      length = ((code & 0x0c) << 6) + bytes[source + 2] + 5;
      distance = ((code & 0x10) << 12) + (bytes[source] << 8) + bytes[source + 1] + 1;
      source += 3;
    } else if (code < 0xfc) {
      literals = (code & 0x1f) * 4 + 4;
    } else {
      literals = code & 3;
      end = true;
    }
    requireInput(literals);
    if (literals + length > declaredSize - destination) {
      throw new Error('Invalid RefPack: command exceeds the declared output size');
    }
    data.set(bytes.subarray(source, source + literals), destination);
    source += literals;
    destination += literals;
    if (length && distance > destination) throw new Error('Invalid RefPack: back-reference precedes the output');
    // Byte-at-a-time copying deliberately permits overlapping LZ references.
    for (let index = 0; index < length; index += 1) {
      data[destination] = data[destination - distance];
      destination += 1;
    }
    if (end) {
      if (destination !== declaredSize) throw new Error('Invalid RefPack: end marker precedes the declared output size');
      return { data, bytesRead: source, declaredSize };
    }
  }
}

function textureName(bytes, offset) {
  let name = '';
  let terminated = false;
  for (let index = 0; index < 4; index += 1) {
    const value = bytes[offset + index];
    if (value === 0) { terminated = true; continue; }
    if (terminated || value < 0x20 || value > 0x7e) invalid('texture identifiers must contain up to four ASCII characters');
    name += String.fromCharCode(value);
  }
  if (!name) invalid('empty texture identifier');
  return name;
}

function bitmapType(type) {
  if (type === 0x40 || type === 0xc0) return { bitsPerPixel: 4, compressed: type === 0xc0 };
  if (type === 0x41 || type === 0xc1) return { bitsPerPixel: 8, compressed: type === 0xc1 };
  if (type === 0x42) return { bitsPerPixel: 16, compressed: false };
  return null;
}

function checkPayload(end, limit, role) {
  if (end > limit) invalid(`${role} is truncated or crosses a chunk boundary`);
  if (limit - end > 7) invalid(`${role} has more than seven unexplained trailing bytes`);
}

function wordToPixel(word, rgba, stp, pixel) {
  const red = word & 31;
  const green = (word >> 5) & 31;
  const blue = (word >> 10) & 31;
  const at = pixel * 4;
  rgba[at] = (red << 3) | (red >> 2);
  rgba[at + 1] = (green << 3) | (green >> 2);
  rgba[at + 2] = (blue << 3) | (blue >> 2);
  rgba[at + 3] = word === 0 ? 0 : 255;
  stp[pixel] = word >>> 15;
}

/**
 * Decode every indexed texture in original index order, preserving duplicate
 * identifiers (for example mipmap levels). No filesystem paths are generated.
 * Returned pixel arrays, palettes and indices are independent of the input.
 */
export function decodePsh(input, { maxPixels, maxTextures, maxDecodedBytes } = {}) {
  const { bytes, view } = inputBytes(input);
  const pixelLimit = positiveLimit(maxPixels, DEFAULT_MAX_PIXELS, 'maxPixels');
  const textureLimit = positiveLimit(maxTextures, DEFAULT_MAX_TEXTURES, 'maxTextures');
  const byteLimit = positiveLimit(maxDecodedBytes, DEFAULT_MAX_DECODED_BYTES, 'maxDecodedBytes');
  if (bytes.length < 16 || !magic(bytes, 0, 'SHPP') || !magic(bytes, 12, 'GIMX')) invalid('expected a complete SHPP/GIMX header');
  const declaredSize = view.getUint32(4, true);
  if (declaredSize !== bytes.length && declaredSize + 12 !== bytes.length) {
    invalid('declared file size must match the file or the documented file-size-minus-12 variant');
  }
  let trailer = null;
  if (declaredSize !== bytes.length) {
    // The five standalone PSH files on this disc carry a 12-byte EA CRCF
    // trailer, excluded by the SHPP length. Its checksum algorithm is outside
    // this decoder; only the signature and trailer length are validated.
    if (declaredSize < 16 || !magic(bytes, declaredSize, 'CRCF') || view.getUint32(declaredSize + 4, true) !== 12) {
      invalid('size-minus-12 variant requires the observed 12-byte CRCF trailer');
    }
    trailer = { signature: 'CRCF', offset: declaredSize, size: 12, checksumVerified: false };
  }
  const contentEnd = declaredSize;
  const count = view.getUint32(8, true);
  if (count > textureLimit || count > Math.floor((contentEnd - 16) / 8)) invalid('texture count exceeds the index or configured limit');
  const headerSize = 16 + count * 8;
  const entries = [];
  const offsets = new Set();
  for (let index = 0; index < count; index += 1) {
    const name = textureName(bytes, 16 + index * 8);
    const offset = view.getUint32(20 + index * 8, true);
    if (offset < headerSize || offset > contentEnd - 16) invalid(`bitmap offset is out of bounds for texture ${index}`);
    if (offsets.has(offset)) invalid('multiple index entries point at the same bitmap');
    offsets.add(offset);
    entries.push({ index, name, offset });
  }
  // Offsets need not be ordered in the file's index. Physical root boundaries
  // prevent a malformed chain from consuming the next texture's data.
  const ordered = [...offsets].sort((left, right) => left - right);
  const limits = new Map(ordered.map((offset, index) => [offset, ordered[index + 1] ?? contentEnd]));
  const textures = [];
  let decodedBytes = 0;
  for (const entry of entries) {
    let cursor = entry.offset;
    const limit = limits.get(entry.offset);
    let bitmap = null;
    let palette = null;
    const chunks = [];
    while (cursor !== null) {
      if (cursor > limit - 4) invalid(`truncated chunk header for texture ${entry.index}`);
      if (chunks.length >= 64) invalid('texture exceeds the 64-chunk limit');
      const type = bytes[cursor];
      const displacement = bytes[cursor + 1] | (bytes[cursor + 2] << 8) | (bytes[cursor + 3] << 16);
      const nextOffset = displacement ? cursor + displacement : null;
      if (nextOffset !== null && (displacement < 4 || nextOffset > limit - 4)) invalid('chunk link is out of bounds or overlaps its header');
      const chunkEnd = nextOffset ?? limit;
      chunks.push({ type, offset: cursor, nextOffset });
      const info = bitmapType(type);
      if (info) {
        if (bitmap || cursor !== entry.offset) invalid('each texture must start with exactly one bitmap chunk');
        if (cursor + 16 > chunkEnd) invalid('truncated bitmap header');
        const width = view.getUint16(cursor + 4, true);
        const height = view.getUint16(cursor + 6, true);
        if (!width || !height || width * height > pixelLimit) invalid('bitmap dimensions exceed the configured pixel limit or are zero');
        const pixelCount = width * height;
        const outputBytes = pixelCount * (info.bitsPerPixel === 16 ? 5 : 6) + (info.bitsPerPixel === 16 ? 0 : (1 << info.bitsPerPixel) * 2);
        if (outputBytes > byteLimit - decodedBytes) invalid('decoded textures exceed the configured byte limit');
        decodedBytes += outputBytes;
        const stride = Math.ceil(width * info.bitsPerPixel / 16) * 2;
        const rawSize = stride * height;
        const start = cursor + 16;
        let pixels;
        if (info.compressed) {
          const decoded = decompressRefPack(bytes.subarray(start, chunkEnd), { maxOutputBytes: rawSize });
          if (decoded.data.length !== rawSize) invalid('RefPack output size does not match the bitmap dimensions');
          checkPayload(start + decoded.bytesRead, chunkEnd, 'compressed bitmap');
          pixels = decoded.data;
        } else {
          checkPayload(start + rawSize, chunkEnd, 'bitmap');
          pixels = bytes.subarray(start, start + rawSize);
        }
        bitmap = {
          ...info, width, height, stride, pixels,
          centerX: view.getUint16(cursor + 8, true), centerY: view.getUint16(cursor + 10, true),
          positionX: view.getUint16(cursor + 12, true), positionY: view.getUint16(cursor + 14, true),
        };
      } else if (type === 0x23) {
        if (!bitmap || palette || bitmap.bitsPerPixel === 16) invalid('unexpected or duplicate palette chunk');
        if (cursor + 16 > chunkEnd) invalid('truncated palette header');
        const width = view.getUint16(cursor + 4, true);
        const height = view.getUint16(cursor + 6, true);
        const colours = 1 << bitmap.bitsPerPixel;
        if (width !== colours || height !== 1) invalid(`expected a ${colours}x1 PS1 palette`);
        checkPayload(cursor + 16 + colours * 2, chunkEnd, 'palette');
        palette = new Uint16Array(colours);
        for (let index = 0; index < colours; index += 1) palette[index] = view.getUint16(cursor + 16 + index * 2, true);
      } else if (type === 0x6f) {
        if (!bitmap) invalid('comment precedes the bitmap');
        // The comment is preserved as chunk metadata only, not decoded as pixels.
      } else {
        throw new Error(`Unsupported PSH chunk type 0x${type.toString(16).padStart(2, '0')} at offset ${cursor}`);
      }
      cursor = nextOffset;
    }
    if (!bitmap) invalid('missing bitmap');
    if (bitmap.bitsPerPixel !== 16 && !palette) invalid('indexed bitmap has no palette');
    const { width, height, bitsPerPixel, compressed, stride, pixels, centerX, centerY, positionX, positionY } = bitmap;
    const rgba = new Uint8Array(width * height * 4);
    const stp = new Uint8Array(width * height);
    const indices = bitsPerPixel === 16 ? null : new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        let word;
        if (bitsPerPixel === 16) {
          const at = y * stride + x * 2;
          word = pixels[at] | (pixels[at + 1] << 8);
        } else {
          const index = bitsPerPixel === 8 ? pixels[y * stride + x]
            : (pixels[y * stride + (x >> 1)] >> ((x & 1) * 4)) & 15;
          indices[pixel] = index;
          word = palette[index];
        }
        wordToPixel(word, rgba, stp, pixel);
      }
    }
    textures.push({ ...entry, width, height, bitsPerPixel, compressed, centerX, centerY, positionX, positionY, rgba, stp, palette, indices, chunks });
  }
  return { format: 'SHPP', declaredSize, headerSize, trailer, textures };
}
