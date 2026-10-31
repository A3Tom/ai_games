import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'public/engine')
const sdkVersion = '4.0.23'
await mkdir(path.join(root, 'public'), { recursive: true })
const license = await readFile(path.join(root, 'vendor/SpaceCadetPinball/LICENSE'), 'utf8')
const notices = await readFile(
  path.join(root, 'vendor/SpaceCadetPinball/THIRD_PARTY_NOTICES.txt'),
  'utf8',
).catch((error) => {
  if (error.code !== 'ENOENT') throw error
  return ''
})
await writeFile(path.join(root, 'public/engine-LICENSE.txt'), license + '\n' + notices)
const hash = createHash('sha256').update(`emsdk:${sdkVersion}\n`)
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) await fingerprint(filename)
    else if (entry.isFile()) {
      hash.update(path.relative(root, filename).split(path.sep).join('/'))
      hash.update(await readFile(filename))
    }
  }
}
await fingerprint(path.join(root, 'engine'))
await fingerprint(path.join(root, 'vendor'))
const sourceHash = hash.digest('hex')
const manifest = { version: 1, sdkVersion, sourceHash }
const args = process.argv.slice(2)
if (args[0] === '--stamp' && args.length === 2) {
  const destination = path.resolve(args[1])
  for (const name of ['space-cadet.js', 'space-cadet.wasm'])
    await readFile(path.join(destination, name))
  await writeFile(path.join(destination, 'build.json'), JSON.stringify(manifest, null, 2) + '\n')
  process.exit(0)
}
if (args.length) throw new Error('Usage: node scripts/build-engine.mjs [--stamp output-directory]')
try {
  const previous = JSON.parse(await readFile(path.join(output, 'build.json'), 'utf8'))
  if (previous.sourceHash === sourceHash && previous.sdkVersion === sdkVersion) {
    for (const name of ['space-cadet.js', 'space-cadet.wasm'])
      await readFile(path.join(output, name))
    console.log('Space Cadet browser engine is up to date.')
    process.exit(0)
  }
} catch {
  /* Build when the source or generated artifacts change. */
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `Missing ${command}. Activate Emscripten ${sdkVersion} first (source /path/to/emsdk/emsdk_env.sh), or build with Docker. See games/pinball/README.md.`,
    )
  }
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`)
}
await mkdir(output, { recursive: true })
run('emcmake', [
  'cmake',
  '-S',
  'engine',
  '-B',
  '.engine-build',
  '-DCMAKE_BUILD_TYPE=Release',
  `-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=${output}`,
])
run('cmake', ['--build', '.engine-build', '--parallel', '4'])
await writeFile(path.join(output, 'build.json'), JSON.stringify(manifest, null, 2) + '\n')
