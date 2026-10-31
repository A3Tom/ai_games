import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_OUTPUT = fileURLToPath(new URL('../dist', import.meta.url))

export async function configureRuntime(directory = DEFAULT_OUTPUT, apiUrl = process.env.VITE_PINBALL_API_URL ?? '') {
  const output = path.resolve(directory)
  await readFile(path.join(output, 'index.html'))
  const config = JSON.stringify({ apiUrl })
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  await writeFile(path.join(output, 'runtime-config.js'), `globalThis.AI_GAMES_PINBALL_CONFIG = ${config};\n`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) {
    throw new Error('Usage: node games/pinball/scripts/configure-runtime.mjs [dist-directory]')
  }
  await configureRuntime(args[0])
}
