import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'pinball-resource-import-'))
  const script = path.join(root, 'games/pinball/scripts/import-resources.mjs')
  const source = path.join(root, 'original')
  const output = path.join(root, 'games/pinball/public/game-data')
  mkdirSync(path.dirname(script), { recursive: true })
  mkdirSync(source)
  writeFileSync(script, readFileSync(new URL('./import-resources.mjs', import.meta.url)))
  try {
    run(script, source, output)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('resource import command', () => {
  it('imports resources and a manifest without copying executables or modifying originals', () => {
    fixture((script, source, output) => {
      mkdirSync(path.join(source, 'Sound'))
      writeFileSync(path.join(source, 'pinball.dat'), 'table')
      writeFileSync(path.join(source, 'Sound/test.wav'), 'sound')
      writeFileSync(path.join(source, 'pinball.exe'), 'executable')
      execFileSync(process.execPath, [script, '--from', source])
      assert.deepEqual(JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8')), {
        version: 1,
        files: ['PINBALL.DAT', 'SOUND/TEST.WAV'],
      })
      assert.equal(readFileSync(path.join(output, 'SOUND/TEST.WAV'), 'utf8'), 'sound')
      assert.equal(readFileSync(path.join(source, 'pinball.dat'), 'utf8'), 'table')
    })
  })

  it('keeps an existing bundle when validation fails', () => {
    fixture((script, source, output) => {
      mkdirSync(output, { recursive: true })
      writeFileSync(path.join(output, 'manifest.json'), 'previous bundle')
      writeFileSync(path.join(source, 'sound.wav'), 'sound')
      const result = spawnSync(process.execPath, [script, '--from', source])
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr.toString(), /must contain PINBALL.DAT/)
      assert.equal(readFileSync(path.join(output, 'manifest.json'), 'utf8'), 'previous bundle')
    })
  })

  it('rejects importing from its own output directory', () => {
    fixture((script, _source, output) => {
      mkdirSync(output, { recursive: true })
      writeFileSync(path.join(output, 'PINBALL.DAT'), 'table')
      const result = spawnSync(process.execPath, [script, '--from', output])
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr.toString(), /must be separate/)
      assert.equal(readFileSync(path.join(output, 'PINBALL.DAT'), 'utf8'), 'table')
    })
  })
})
