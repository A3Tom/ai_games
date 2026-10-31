import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { runInNewContext } from 'node:vm'

import { configureRuntime } from './configure-runtime.mjs'

async function temporary(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pinball-runtime-test-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('runtime configuration', () => {
  it('safely serializes a URL without executing its contents', async () => {
    await temporary(async (directory) => {
      await writeFile(path.join(directory, 'index.html'), '<!doctype html>')
      const apiUrl = 'https://relay.example/api/pinball?quote="\\\n;globalThis.injected=true;//</script>\u2028\u2029'
      await configureRuntime(directory, apiUrl)
      const script = await readFile(path.join(directory, 'runtime-config.js'), 'utf8')
      const context = {}
      runInNewContext(script, context)

      assert.equal(context.AI_GAMES_PINBALL_CONFIG.apiUrl, apiUrl)
      assert.equal(context.injected, undefined)
      assert.equal(script.includes('\u2028'), false)
      assert.equal(script.includes('\u2029'), false)
      assert.equal(script.endsWith('\n'), true)
    })
  })

  it('can reset an existing external API configuration to the same-origin default', async () => {
    await temporary(async (directory) => {
      await writeFile(path.join(directory, 'index.html'), '<!doctype html>')
      await configureRuntime(directory, 'https://relay.example/api/pinball')
      await configureRuntime(directory, '')
      const context = {}
      runInNewContext(await readFile(path.join(directory, 'runtime-config.js'), 'utf8'), context)
      assert.equal(context.AI_GAMES_PINBALL_CONFIG.apiUrl, '')
    })
  })

  it('leaves existing configuration untouched when the target is not a built game', async () => {
    await temporary(async (directory) => {
      const config = path.join(directory, 'runtime-config.js')
      await writeFile(config, 'previous configuration')
      await assert.rejects(configureRuntime(directory, 'https://relay.example/api/pinball'), {
        code: 'ENOENT',
      })
      assert.equal(await readFile(config, 'utf8'), 'previous configuration')
    })
  })
})
