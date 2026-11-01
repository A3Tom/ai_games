import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBootstrapLayout, inspectCodeLayout, inspectLayout } from './layout.mjs'

const sizes = { 'BECODE.BIN': 939136, 'FECODE.BIN': 733204 }
// Only the relevant instructions/data are populated; this is not a game image.
function fixture() {
  const bytes = Buffer.alloc(0x4300)
  bytes.write('PS-X EXE')
  bytes.writeUInt32LE(0x80014fb8, 0x10)
  bytes.writeUInt32LE(0x80011800, 0x18)
  bytes.writeUInt32LE(bytes.length - 2048, 0x1c)
  const put = (address, word) => bytes.writeUInt32LE(word, address - 0x80011000)
  const words = {
    0x800150c8: 0x0c005443, 0x800150cc: 0x00002021, 0x800150d0: 0x0c01da53,
    0x800150d8: 0x0c005443, 0x800150dc: 0x24040001, 0x800150e0: 0x0c037799,
    0x8001511c: 0x00808021, 0x80015180: 0x1200000b,
    0x80015188: 0x3c058001, 0x8001518c: 0x8ca542fc,
    0x800142fc: 0x8005ae28,
    0x80015190: 0x3c048001, 0x80015194: 0x24843d68, 0x80015198: 0x0c0082f4,
    0x800151a0: 0x3c058014, 0x800151a4: 0x24a502a8,
    0x800151b0: 0x3c058001, 0x800151b4: 0x8ca542fc,
    0x800151b8: 0x3c048001, 0x800151bc: 0x24843d74, 0x800151c0: 0x0c0082f4,
    0x800151cc: 0x3c058011, 0x800151d0: 0x24a5de40,
  }
  for (const [address, word] of Object.entries(words)) put(Number(address), word)
  bytes.write('becode.bin\0', 0x2d68)
  bytes.write('fecode.bin\0', 0x2d74)
  return { bytes, put }
}

test('static decoder recovers shared destination, direct entries and heap padding', () => {
  const { bytes } = fixture()
  const { overlays, evidence } = decodeBootstrapLayout(bytes, sizes)
  assert.deepEqual(overlays.map((overlay) => ({ ...overlay })), [
    { file: 'FECODE.BIN', size: 733204, loadAddress: '0x8005ae28', endAddress: '0x8010de3c',
      entryAddress: '0x8007694c', entryOffset: 0x1bb24, heapStart: '0x8010de40', heapPadding: 4, switchArgument: 0 },
    { file: 'BECODE.BIN', size: 939136, loadAddress: '0x8005ae28', endAddress: '0x801402a8',
      entryAddress: '0x800dde64', entryOffset: 0x8303c, heapStart: '0x801402a8', heapPadding: 0, switchArgument: 1 },
  ])
  assert.ok(evidence.some((item) => item.address === '0x800142fc' && item.word === '0x8005ae28'))
})

test('synthetic matching instructions cannot identify the executable profile', () => {
  const { bytes } = fixture()
  const result = inspectLayout(bytes, sizes)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.reason, 'unknown-executable')
  assert.equal(result.profile, null)
  assert.deepEqual(result.overlays, [])
})

test('truncated or invalid executable yields no addresses', () => {
  for (const bytes of [Buffer.alloc(4), fixture().bytes.subarray(0, 0x4100)]) {
    const result = inspectLayout(bytes, sizes)
    assert.equal(result.status, 'unsupported')
    assert.equal(result.reason, 'invalid-executable')
    assert.deepEqual(result.overlays, [])
  }
})

test('decoder refuses changed instructions, out-of-range entries and inconsistent sizes', () => {
  const wrongPattern = fixture()
  wrongPattern.put(0x80015194, 0x24853d68)
  assert.throws(() => decodeBootstrapLayout(wrongPattern.bytes, sizes), /constant construction/)
  const wrongEntry = fixture()
  wrongEntry.put(0x800150d0, 0x0c000000)
  assert.throws(() => decodeBootstrapLayout(wrongEntry.bytes, sizes), /inconsistent/)
  assert.throws(() => decodeBootstrapLayout(fixture().bytes, { ...sizes, 'FECODE.BIN': 733209 }), /inconsistent/)
  assert.throws(() => decodeBootstrapLayout(fixture().bytes, {}), /inconsistent/)
})

test('missing files are unsupported; genuine disc read errors propagate', async () => {
  const missing = await inspectCodeLayout({ files: [], readFile() { throw new Error('should not read') } })
  assert.equal(missing.reason, 'missing-files')
  assert.deepEqual(missing.missingFiles, ['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN'])
  const files = ['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN'].map((path) => ({ path, size: 1 }))
  await assert.rejects(inspectCodeLayout({ files, async readFile() { throw new Error('bad sector') } }), /bad sector/)
})
