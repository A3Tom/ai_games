import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { inspectLocomotionAnimation, parseAnimationActions } from './locomotion-animation.mjs'

const { values } = parseArgs({ options: { directory: { type: 'string' }, help: { type: 'boolean' } } })
if (values.help) {
  console.log('Usage: node games/fifa98/scripts/locomotion-animation-recovery.mjs [--directory EXTRACTED_REFERENCE_ROOT]\nRead-only source fingerprints and original action-table mappings; no console code runs.')
} else {
  const directory = values.directory ? path.resolve(values.directory) : fileURLToPath(new URL('../.work/reference/', import.meta.url))
  const [backend, actions] = await Promise.all([
    readFile(path.join(directory, 'disc/BECODE.BIN')),
    readFile(path.join(directory, 'members/ZMODAT.BIG/aiseqs.tbi')),
  ])
  const report = await inspectLocomotionAnimation(backend, actions)
  const examples = report.status === 'reconstruction-only' ? [554, 659, 327, 499, 500, 501, 553].map((id) => parseAnimationActions(actions).records[id]) : []
  console.log(JSON.stringify({ ...report, normalStyleExamples: examples }, null, 2))
}
