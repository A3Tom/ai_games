import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { prepareMedia } from './media.mjs'

const { values } = parseArgs({ options: { from: { type: 'string' }, bios: { type: 'string' } } })
if (!values.from) throw new Error('Usage: node games/overboard/scripts/import-media.mjs --from /path/to/disc-folder [--bios /path/to/bios.bin]')
const manifest = await prepareMedia({
  source: path.resolve(values.from),
  output: fileURLToPath(new URL('../public/game-data', import.meta.url)),
  bios: values.bios,
  force: true,
})
console.log(`Imported the complete Overboard disc: ${manifest.tracks} tracks (${manifest.size} bytes).`)
