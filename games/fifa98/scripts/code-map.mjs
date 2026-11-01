import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectLayout, inspectCodeLayout } from './layout.mjs'

const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const registers = ['zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 't8', 't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra']

/** Decode MIPS-I instruction fields only; no register values or instructions run. */
export function decodeInstruction(word, address) {
  word >>>= 0
  address >>>= 0
  const op = word >>> 26, rs = word >>> 21 & 31, rt = word >>> 16 & 31
  const rd = word >>> 11 & 31, shift = word >>> 6 & 31, fn = word & 63
  const immediate = word & 65535, signed = immediate << 16 >> 16
  const r = (index) => `$${registers[index]}`
  const target = ((address + 4 + signed * 4) >>> 0)
  let mnemonic = 'unknown', operands = '', flow = { kind: 'next' }, writes = []
  const set = (name, args, destination = []) => { mnemonic = name; operands = args; writes = destination }
  const branch = (name, args, unconditional = false) => {
    set(name, `${args}${args ? ', ' : ''}${hex(target)}`)
    flow = { kind: 'branch', target, unconditional, delaySlot: true }
  }
  if (word === 0) set('nop', '')
  else if (op === 0) {
    if ([0, 2, 3].includes(fn) && rs === 0) set({ 0: 'sll', 2: 'srl', 3: 'sra' }[fn], `${r(rd)}, ${r(rt)}, ${shift}`, [rd])
    else if ([4, 6, 7].includes(fn) && shift === 0) set({ 4: 'sllv', 6: 'srlv', 7: 'srav' }[fn], `${r(rd)}, ${r(rt)}, ${r(rs)}`, [rd])
    else if (fn === 8 && rt === 0 && rd === 0 && shift === 0) {
      set('jr', r(rs)); flow = { kind: rs === 31 ? 'return' : 'indirect-jump', register: rs, delaySlot: true }
    } else if (fn === 9 && rt === 0 && shift === 0) {
      set('jalr', `${r(rd)}, ${r(rs)}`, [rd]); flow = { kind: 'indirect-call', register: rs, delaySlot: true }
    } else if ([12, 13].includes(fn)) {
      set(fn === 12 ? 'syscall' : 'break', String(word >>> 6 & 0xfffff)); flow = { kind: 'trap' }
    } else if ([16, 18].includes(fn) && rs === 0 && rt === 0 && shift === 0) {
      set(fn === 16 ? 'mfhi' : 'mflo', r(rd), [rd])
    } else if ([17, 19].includes(fn) && rt === 0 && rd === 0 && shift === 0) set(fn === 17 ? 'mthi' : 'mtlo', r(rs))
    else if ([24, 25, 26, 27].includes(fn) && rd === 0 && shift === 0) {
      set({ 24: 'mult', 25: 'multu', 26: 'div', 27: 'divu' }[fn], `${r(rs)}, ${r(rt)}`)
    } else if ([32, 33, 34, 35, 36, 37, 38, 39, 42, 43].includes(fn) && shift === 0) {
      set({ 32: 'add', 33: 'addu', 34: 'sub', 35: 'subu', 36: 'and', 37: 'or', 38: 'xor', 39: 'nor', 42: 'slt', 43: 'sltu' }[fn], `${r(rd)}, ${r(rs)}, ${r(rt)}`, [rd])
    }
  } else if (op === 2 || op === 3) {
    const destination = (((address + 4) & 0xf0000000) | ((word & 0x03ffffff) << 2)) >>> 0
    set(op === 2 ? 'j' : 'jal', hex(destination), op === 3 ? [31] : [])
    flow = { kind: op === 2 ? 'jump' : 'call', target: destination, delaySlot: true }
  } else if (op === 1 && [0, 1, 16, 17].includes(rt)) {
    branch({ 0: 'bltz', 1: 'bgez', 16: 'bltzal', 17: 'bgezal' }[rt], r(rs))
    if (rt >= 16) { flow.kind = 'call'; flow.conditional = true; writes = [31] }
  } else if (op === 4 || op === 5) branch(op === 4 ? 'beq' : 'bne', `${r(rs)}, ${r(rt)}`, op === 4 && rs === rt)
  else if ((op === 6 || op === 7) && rt === 0) branch(op === 6 ? 'blez' : 'bgtz', r(rs))
  else if ([8, 9, 10, 11, 12, 13, 14].includes(op)) {
    set({ 8: 'addi', 9: 'addiu', 10: 'slti', 11: 'sltiu', 12: 'andi', 13: 'ori', 14: 'xori' }[op], `${r(rt)}, ${r(rs)}, ${op >= 12 ? hex(immediate) : signed}`, [rt])
  } else if (op === 15 && rs === 0) set('lui', `${r(rt)}, ${hex(immediate)}`, [rt])
  else if ([32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 46, 50, 58].includes(op)) {
    set({ 32: 'lb', 33: 'lh', 34: 'lwl', 35: 'lw', 36: 'lbu', 37: 'lhu', 38: 'lwr', 40: 'sb', 41: 'sh', 42: 'swl', 43: 'sw', 46: 'swr', 50: 'lwc2', 58: 'swc2' }[op], `${op === 50 || op === 58 ? `$cop2_${rt}` : r(rt)}, ${signed}(${r(rs)})`, op <= 38 ? [rt] : [])
  } else if (op === 16 || op === 18) {
    const coprocessor = op === 16 ? 0 : 2
    if ([0, 2, 4, 6].includes(rs) && (word & 0x7ff) === 0) {
      set({ 0: 'mfc', 2: 'cfc', 4: 'mtc', 6: 'ctc' }[rs] + coprocessor, `${r(rt)}, $cop${coprocessor}_${rd}`, rs < 4 ? [rt] : [])
    } else if (op === 18 && rs >= 16) set('gte', hex(word & 0x1ffffff))
    else if (op === 16 && word === 0x42000010) set('rfe', '')
  }
  return { address, word, mnemonic, operands, flow, writes, rs, rt, immediate, signed, known: mnemonic !== 'unknown' }
}

function stringsIn(image, assetNames) {
  const output = []
  const bytes = image.bytes
  for (let i = image.start; i < bytes.length;) {
    if (bytes[i] < 32 || bytes[i] > 126) { i++; continue }
    const start = i
    while (i < bytes.length && bytes[i] >= 32 && bytes[i] <= 126) i++
    if (i - start < 4 || i - start > 240 || bytes[i] !== 0) continue
    const text = bytes.subarray(start, i).toString('ascii')
    if (!/[A-Za-z]{3}/.test(text)) continue
    const asset = assetNames.has(text.toLowerCase()) || /\.(?:big|bin|off|psh|shp|db|str|tim|txt|bk\d)\b/i.test(text)
    const diagnostic = /(?:error|failed|unsupported|memory|assert|DMA|CdRead|CdGetToc|DiskError|SPU|GPU)/i.test(text)
    output.push({ address: image.base + start - image.start, fileOffset: start, text, category: asset ? 'asset-name' : diagnostic ? 'diagnostic' : 'text' })
  }
  return output
}

function traceContext(context, options) {
  const { images, entry } = context
  const locate = (address) => images.find((image) => address >= image.base && address + 4 <= image.base + image.bytes.length - image.start)
  const instructionAt = (address) => {
    const image = locate(address)
    if (!image || address % 4) return null
    return decodeInstruction(image.bytes.readUInt32LE(address - image.base + image.start), address)
  }
  const strings = new Map(images.flatMap((image) => image.strings.map((item) => [item.address, { ...item, image: image.file }])))
  const roots = new Set([entry])
  const pendingRoots = [entry]
  const functions = []
  let total = 0
  while (pendingRoots.length && functions.length < options.maxFunctions && total < options.maxTotalInstructions) {
    const root = pendingRoots.shift()
    const image = locate(root)
    if (!image) continue
    const visited = new Map(), expanded = new Set(), pending = [root], edges = [], calls = [], stops = [], references = []
    let limited = false
    function enqueue(address) {
      if (address < root || address >= root + options.maxFunctionSpan || !locate(address)) return false
      if (!expanded.has(address)) pending.push(address)
      return true
    }
    function callTarget(at, target, kind) {
      const destination = locate(target)
      calls.push({ at: hex(at), target: hex(target), image: destination?.file ?? null, kind })
      if (destination && !roots.has(target)) { roots.add(target); pendingRoots.push(target) }
    }
    while (pending.length) {
      const address = pending.pop()
      if (expanded.has(address)) continue
      if (visited.size >= options.maxInstructionsPerFunction || total >= options.maxTotalInstructions) { limited = true; break }
      const instruction = instructionAt(address)
      if (!instruction) { stops.push({ at: hex(address), reason: 'outside-loaded-images' }); continue }
      if (!visited.has(address)) { visited.set(address, instruction); total++ }
      expanded.add(address)
      if (!instruction.known) { stops.push({ at: hex(address), reason: 'unknown-instruction', word: hex(instruction.word) }); continue }
      const { flow } = instruction
      if (flow.kind === 'next') {
        if (!enqueue(address + 4)) stops.push({ at: hex(address), reason: 'function-span-boundary' })
        continue
      }
      if (flow.delaySlot) {
        const slot = instructionAt(address + 4)
        if (!slot) { stops.push({ at: hex(address), reason: 'missing-delay-slot' }); continue }
        if (!visited.has(address + 4)) { visited.set(address + 4, slot); total++ }
        if (!slot.known || slot.flow.kind !== 'next') stops.push({ at: hex(address + 4), reason: 'unresolved-delay-slot' })
      }
      if (flow.kind === 'call') {
        callTarget(address, flow.target, flow.conditional ? 'conditional-call' : 'direct-call')
        enqueue(address + 8)
      } else if (flow.kind === 'indirect-call') {
        stops.push({ at: hex(address), reason: 'indirect-call', register: registers[flow.register] })
        enqueue(address + 8)
      } else if (flow.kind === 'branch') {
        edges.push({ at: hex(address), target: hex(flow.target), kind: 'branch', backwards: flow.target <= address })
        if (!enqueue(flow.target)) stops.push({ at: hex(address), reason: 'branch-outside-function-range', target: hex(flow.target) })
        if (!flow.unconditional) enqueue(address + 8)
      } else if (flow.kind === 'jump') {
        const destination = instructionAt(flow.target)
        const prologue = destination && destination.word >>> 16 === 0x27bd && destination.signed < 0
        if (flow.target < root || (flow.target !== root && prologue) || (roots.has(flow.target) && flow.target !== root)) {
          callTarget(address, flow.target, 'tail-call-candidate')
        } else {
          edges.push({ at: hex(address), target: hex(flow.target), kind: 'jump', backwards: flow.target <= address })
          if (!enqueue(flow.target)) stops.push({ at: hex(address), reason: 'jump-outside-function-range', target: hex(flow.target) })
        }
      } else if (flow.kind !== 'return') stops.push({ at: hex(address), reason: flow.kind })
    }
    // Adjacent LUI + address construction is a syntactic xref. It does not
    // interpret a register state or infer pointers from arbitrary data words.
    for (const [address, instruction] of visited) {
      if (instruction.mnemonic !== 'lui') continue
      const next = visited.get(address + 4)
      if (!next || next.rs !== instruction.rt) continue
      if (!['addiu', 'ori', 'lw', 'lh', 'lhu', 'lb', 'lbu', 'sw', 'sh', 'sb'].includes(next.mnemonic)) continue
      const target = ((instruction.immediate * 65536) + (next.mnemonic === 'ori' ? next.immediate : next.signed)) >>> 0
      const literal = strings.get(target)
      if (literal) references.push({ at: hex(address), target: hex(target), image: literal.image, text: literal.text, category: literal.category, evidence: [hex(instruction.word), hex(next.word)] })
    }
    const diagnostics = references.filter((item) => item.category === 'diagnostic')
    const assets = references.filter((item) => item.category === 'asset-name')
    let classification = 'unclassified'
    if (image.file === 'SLES_009.14' && diagnostics.some((item) => /CdRead|CdGetToc|CDROM|DiskError|DMA|SPU|GPU/i.test(item.text))) classification = 'platform-library-candidate'
    else if (assets.length) classification = 'asset-using-routine-candidate'
    const addresses = [...visited.keys()].sort((a, b) => a - b)
    functions.push({
      address: hex(root), image: image.file, fileOffset: root - image.base + image.start,
      instructionCount: visited.size, minAddress: hex(addresses[0] ?? root), maxAddress: hex(addresses.at(-1) ?? root),
      classification, calls, references, controlFlow: edges,
      returns: [...visited.values()].filter((item) => item.flow.kind === 'return').map((item) => hex(item.address)),
      gteInstructions: [...visited.values()].filter((item) => item.mnemonic === 'gte').length,
      unresolved: stops, limited,
    })
  }
  return {
    context: context.name, entryAddress: hex(entry),
    loadedImages: images.map((image) => image.file), functions,
    summary: {
      functions: functions.length, instructions: total,
      directCalls: functions.reduce((sum, item) => sum + item.calls.length, 0),
      functionsWithBackEdges: functions.filter((item) => item.controlFlow.some((edge) => edge.backwards)).length,
      functionsWithUnresolvedFlow: functions.filter((item) => item.unresolved.length || item.limited).length,
    },
    limited: pendingRoots.length > 0,
  }
}

const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
function knownCandidates(backend) {
  if (hash(backend.bytes) !== BACKEND_HASH) return []
  function routine(address, size, expectedHash) {
    const offset = address - backend.base
    const bytes = backend.bytes.subarray(offset, offset + size)
    if (hash(bytes) !== expectedHash) throw new Error('Reviewed routine fingerprint differs from its verified image.')
    const disassembly = []
    for (let i = 0; i < size; i += 4) {
      const item = decodeInstruction(bytes.readUInt32LE(i), address + i)
      disassembly.push({ address: hex(item.address), word: hex(item.word), instruction: `${item.mnemonic}${item.operands ? ' ' + item.operands : ''}` })
    }
    return { image: backend.file, address: hex(address), fileOffset: offset, size, sha256: hash(bytes), bytes: bytes.toString('hex'), disassembly }
  }
  return [{
    id: 'backend-u32-scale-and-cap',
    ...routine(0x80102044, 56, '6635357b180c0a42de00c400580d4886311f296ab7dae18e86bdd61ae693961e'),
    status: 'manually-reviewed-integer-routine',
    semantics: 'With unsigned 32-bit wrap: x=(input<<6)+7; q=high32(x*0x88888889)>>3; y=q+35; return y<100 ? y : 99.',
    constraints: ['No loads, stores, function calls, coprocessor instructions, or external state.', 'Stat/attribute meaning is a candidate; the database field identity remains unresolved.'],
    callerEvidence: [{ address: '0x80105f20', word: '0x0c040811',
      detail: 'Aligned direct call. Its input is loaded with LBU at offset 0x10 from a pointer plus byte[0x8012f879]; the result is formatted with the literal %d at 0x8005d3f8.' }],
  }, {
    id: 'backend-signed-rounded-reciprocal',
    ...routine(0x80124640, 56, 'ed3fa46a1a62d42eec3d1dfbe6bf62c91b6b1e46e2778c8ed0b85db1f5a6bb41'),
    status: 'manually-reviewed-integer-routine',
    semantics: 'All operations wrap to 32 bits. sign=ASR32(input,31); magnitude=(input XOR sign)-sign; DIVU(0xffffffff,magnitude) yields quotient q and remainder r; q+=(uint32(ASR32(magnitude,1))<r); return (q XOR sign)-sign. For magnitude zero, PS1 DIVU yields q=0xffffffff and r=0xffffffff, so the returned result is zero.',
    constraints: ['No loads, stores, function calls, coprocessor instructions, or external state.', 'Arithmetic right shift of magnitude 0x80000000 is essential: input INT_MIN returns 0xffffffff.', 'Its original symbol and fixed-point convention remain unresolved.'],
    architectureSource: 'https://psx-spx.consoledev.net/cpuspecifications/#multiplydivide',
    callerEvidence: [0x800770d8, 0x8007b7f0, 0x8007d06c, 0x8007d0bc, 0x8007d4b0, 0x800a5348, 0x800a5380, 0x800a5514, 0x800a554c, 0x800ae614, 0x800c875c, 0x800c8774, 0x800d1b98, 0x800d4a00].map((address) => ({ address: hex(address), word: hex(backend.bytes.readUInt32LE(address - backend.base)), detail: 'Aligned direct JAL to the reviewed helper.' })),
  }]
}

function reviewRegions(frontend, backend, contexts) {
  const output = []
  for (const spec of [
    { image: frontend, digest: '7faa2be3eda58aecf8d71d77a1093fbd6f9b9b67ea9bfa4b6b18b67c32c9850b', context: 'frontend-overlay', root: 0x80078c10, at: 0x800794d8, target: 0x8007928c, id: 'frontend-menu-loop-candidate', detail: 'Called by the verified overlay entry at 0x80076aa0; references main/ftitle and menu image assets.' },
    { image: backend, digest: BACKEND_HASH, context: 'backend-overlay', root: 0x800dde64, at: 0x800de304, target: 0x800de184, id: 'backend-match-loop-candidate', detail: 'Backward branch inside the verified backend entry; update/render roles and frame timing remain unresolved.' },
  ]) {
    if (hash(spec.image.bytes) !== spec.digest) continue
    const fn = contexts.find((item) => item.context === spec.context)?.functions.find((item) => Number(item.address) === spec.root)
    const edge = fn?.controlFlow.find((item) => Number(item.at) === spec.at && Number(item.target) === spec.target)
    if (!edge) continue
    output.push({ id: spec.id, status: 'manual-review-candidate', image: spec.image.file, function: hex(spec.root), detail: spec.detail,
      evidence: { edge, word: hex(spec.image.bytes.readUInt32LE(spec.at - spec.image.base)), callsInsideLoop: fn.calls.filter((call) => Number(call.at) >= spec.target && Number(call.at) <= spec.at) } })
  }
  if (hash(backend.bytes) === BACKEND_HASH) {
    const fn = contexts.find((item) => item.context === 'backend-overlay')?.functions.find((item) => item.address === '0x800d7578')
    if (fn) output.push({ id: 'backend-player-model-resource-setup', status: 'manual-review-candidate', image: backend.file, function: fn.address,
      detail: 'Passes zgmplyr3.big to resident routine 0x8001d908 at 0x800d77f0 with a1=32. Its archive contains PCMD members nhead1.pc/nhead2.pc/nhead3.pc/nshadow.pc/nhigh.pc/nlow.pc/nslow.pc/nmedium.pc/worldcup.pc/leagcup.pc. Mesh fields are not recovered.',
      evidence: { references: fn.references.filter((item) => /zgmplyr3|zgaplayr|gameball/.test(item.text)), call: fn.calls.find((item) => item.at === '0x800d77f0') } })
  }
  return output
}

export function analyzeCodeImages({ boot, frontend, backend }, options = {}) {
  for (const [name, bytes] of Object.entries({ boot, frontend, backend })) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError(`${name} must be executable bytes.`)
  }
  const layout = inspectLayout(boot, { 'FECODE.BIN': frontend.length, 'BECODE.BIN': backend.length })
  if (layout.status !== 'identified') return { version: 1, status: 'unsupported', reason: layout.reason, profile: null, contexts: [], recoveryCandidates: [] }
  const limits = {
    maxFunctions: options.maxFunctions ?? 5000,
    maxTotalInstructions: options.maxTotalInstructions ?? 400000,
    maxInstructionsPerFunction: options.maxInstructionsPerFunction ?? 8192,
    maxFunctionSpan: options.maxFunctionSpan ?? 65536,
  }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) throw new Error(`Invalid analysis limit ${key}.`)
  }
  const assetNames = new Set((options.assetNames ?? []).map((value) => value.toLowerCase()))
  const image = (file, bytes, base, start = 0) => ({ file, bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), base, start })
  const resident = image('SLES_009.14', boot, layout.boot.header.loadAddress, 2048)
  const fe = image('FECODE.BIN', frontend, Number(layout.overlays[0].loadAddress))
  const be = image('BECODE.BIN', backend, Number(layout.overlays[1].loadAddress))
  for (const item of [resident, fe, be]) item.strings = stringsIn(item, assetNames)
  const contexts = [
    { name: 'resident-bootstrap', entry: layout.boot.header.entryPc, images: [resident] },
    { name: 'frontend-overlay', entry: Number(layout.overlays[0].entryAddress), images: [fe, resident] },
    { name: 'backend-overlay', entry: Number(layout.overlays[1].entryAddress), images: [be, resident] },
  ].map((context) => traceContext(context, limits))
  return {
    version: 1, status: 'static-recovery-map', profile: layout.profile,
    methodology: 'Recursive traversal from verified bootstrap/overlay entries and their direct calls. Conditional branches retain both paths, delay slots are included, and indirect targets remain unresolved. Function boundaries and tail-call labels are candidates.',
    limits,
    images: [resident, fe, be].map((item) => ({ file: item.file, sha256: hash(item.bytes), size: item.bytes.length, loadAddress: hex(item.base), payloadOffset: item.start,
      strings: item.strings.map((literal) => ({ ...literal, address: hex(literal.address) })) })),
    contexts, recoveryCandidates: knownCandidates(be), reviewRegions: reviewRegions(fe, be, contexts),
    limitations: ['No game code is executed or interpreted.', 'Reachability is static overapproximation; instruction-like data and indirect jump tables require manual review.', 'No original source, exact function boundaries, gameplay labels, or runtime loop frequency are established automatically.', 'Resident addresses are analyzed separately for each active overlay context.'],
  }
}

export async function inspectCodeMap(disc, options = {}) {
  const layout = await inspectCodeLayout(disc)
  if (layout.status !== 'identified') return { version: 1, status: 'unsupported', profile: null, reason: layout.reason, contexts: [], recoveryCandidates: [] }
  const [boot, frontend, backend] = await Promise.all(['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN'].map((file) => disc.readFile(file, { maxBytes: 1024 * 1024 })))
  return analyzeCodeImages({ boot, frontend, backend }, options)
}

// A generic helper for synthetic test fixtures and independently reviewed images.
// It does not claim that an arbitrary image belongs to the FIFA profile.
export function mapStaticImage(bytes, { base, entry, maxInstructionsPerFunction = 8192 } = {}) {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(base) || !Number.isSafeInteger(entry) || base < 0 || base + bytes.length > 0x100000000 || entry < base || entry >= base + bytes.length || base % 4 || entry % 4 || bytes.length % 4 ||
      !Number.isSafeInteger(maxInstructionsPerFunction) || maxInstructionsPerFunction < 1 || maxInstructionsPerFunction > 1000000) throw new Error('Invalid static image range or analysis limit.')
  const item = { file: 'synthetic-or-unprofiled', bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), base, start: 0 }
  item.strings = stringsIn(item, new Set())
  return traceContext({ name: 'unprofiled', entry, images: [item] }, { maxFunctions: 1000, maxTotalInstructions: 100000, maxInstructionsPerFunction, maxFunctionSpan: 65536 })
}

export async function runCodeMap(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { reference: { type: 'string', default: 'games/fifa98/.work/reference' }, help: { type: 'boolean' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/code-map.mjs [--reference EXTRACTED_DIRECTORY]\nReads disc/SLES_009.14, FECODE.BIN and BECODE.BIN. Prints static JSON; executes no game instructions.'); return }
  const directory = path.join(values.reference, 'disc')
  const [boot, frontend, backend] = await Promise.all(['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN'].map((file) => readFile(path.join(directory, file))))
  console.log(JSON.stringify(analyzeCodeImages({ boot, frontend, backend }), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCodeMap().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
