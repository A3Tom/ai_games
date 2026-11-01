import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCodeImages, decodeInstruction, mapStaticImage } from './code-map.mjs'

const bytes = (...words) => { const data = Buffer.alloc(words.length * 4); words.forEach((word, i) => data.writeUInt32LE(word >>> 0, i * 4)); return data }

test('decoder preserves MIPS signed targets, jump region and architectural delay slots', () => {
  assert.deepEqual(decodeInstruction(0x1480fffe, 0x80010004).flow, { kind: 'branch', target: 0x80010000, unconditional: false, delaySlot: true })
  assert.equal(decodeInstruction(0x0c040811, 0x80010000).flow.target, 0x80102044)
  assert.equal(decodeInstruction(0x03e00008, 0).flow.kind, 'return')
  assert.equal(decodeInstruction(0x00820019, 0).mnemonic, 'multu')
  assert.equal(decodeInstruction(0x00002810, 0).mnemonic, 'mfhi')
  assert.equal(decodeInstruction(0x03e00008, 0).flow.register, 31)
  assert.equal(decodeInstruction(0xffffffff, 0).known, false)
})

test('recursive CFG discovers calls and retains branch paths and return delay slots', () => {
  const image = bytes(0x0c004008, 0x24040001, 0x10800002, 0x24420001,
    0x24420002, 0x03e00008, 0x24420003, 0x00000000,
    0x03e00008, 0x24020009)
  const map = mapStaticImage(image, { base: 0x80010000, entry: 0x80010000 })
  assert.equal(map.functions.length, 2)
  const root = map.functions.find((item) => item.address === '0x80010000')
  assert.equal(root.calls[0].target, '0x80010020')
  assert.equal(root.instructionCount, 7)
  assert.deepEqual(root.returns, ['0x80010014'])
  assert.equal(root.controlFlow[0].target, '0x80010014')
  assert.equal(map.functions[1].instructionCount, 2)
})

test('back edges stop traversal cycles; indirect control flow remains unresolved', () => {
  const loop = mapStaticImage(bytes(0x2484ffff, 0x1480fffe, 0, 0x03e00008, 0), { base: 0x80010000, entry: 0x80010000 })
  assert.equal(loop.functions[0].instructionCount, 5)
  assert.equal(loop.functions[0].controlFlow[0].backwards, true)
  const indirect = mapStaticImage(bytes(0x01000008, 0), { base: 0x80010000, entry: 0x80010000 })
  assert.equal(indirect.functions[0].unresolved[0].reason, 'indirect-jump')
  assert.equal(indirect.functions[0].instructionCount, 2)
})

test('static adjacent string xrefs identify assets without following data as instructions', () => {
  const image = Buffer.concat([bytes(0x3c048001, 0x24840010, 0x03e00008, 0), Buffer.from('zmain.big\0\0\0')])
  const map = mapStaticImage(image, { base: 0x80010000, entry: 0x80010000 })
  assert.equal(map.functions[0].instructionCount, 4)
  assert.equal(map.functions[0].references[0].text, 'zmain.big')
  assert.equal(map.functions[0].classification, 'asset-using-routine-candidate')
})

test('bounds and unknown instructions terminate conservatively', () => {
  const unknown = mapStaticImage(bytes(0xffffffff, 0), { base: 0x80010000, entry: 0x80010000 })
  assert.equal(unknown.functions[0].unresolved[0].reason, 'unknown-instruction')
  const limited = mapStaticImage(bytes(0, 0, 0, 0), { base: 0x80010000, entry: 0x80010000, maxInstructionsPerFunction: 2 })
  assert.equal(limited.functions[0].limited, true)
  assert.throws(() => mapStaticImage(bytes(0), { base: 3, entry: 3 }), /Invalid/)
  const unsupported = analyzeCodeImages({ boot: Buffer.alloc(2048), frontend: Buffer.alloc(4), backend: Buffer.alloc(4) })
  assert.equal(unsupported.status, 'unsupported')
  assert.deepEqual(unsupported.recoveryCandidates, [])
})
