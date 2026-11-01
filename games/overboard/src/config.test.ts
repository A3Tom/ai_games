import { describe, expect, it } from 'vitest'

import {
  buildEmulatorConfig,
  controllerStatus,
  readManifest,
  validateBios,
  validateLocalDisc,
} from './config'

const manifest = {
  version: 1,
  title: 'Overboard! (Europe)',
  file: 'overboard-europe.zip',
  size: 640 * 1024 * 1024,
  tracks: 31,
}

describe('PlayStation player configuration', () => {
  it('keeps PlayStation face buttons in their physical positions on a standard gamepad', () => {
    const config = buildEmulatorConfig({ url: 'blob:local-disc', name: 'disc.zip', size: 100 }, 'https://games.example/ai_games/overboard/')
    const controls = config.EJS_defaultControls as Record<number, Record<number, { value?: string; value2?: string }>>

    // RetroPad B/Y/A/X become PlayStation cross/square/circle/triangle.
    expect(controls[0][0]).toEqual({ value: 'x', value2: 'BUTTON_1' })
    expect(controls[0][1]).toEqual({ value: 'z', value2: 'BUTTON_3' })
    expect(controls[0][8]).toEqual({ value: 'c', value2: 'BUTTON_2' })
    expect(controls[0][9]).toEqual({ value: 's', value2: 'BUTTON_4' })
    expect(controls[0][2]).toEqual({ value: 'shift', value2: 'SELECT' })
    expect(controls[0][3]).toEqual({ value: 'enter', value2: 'START' })
    expect([4, 5, 6, 7].map((id) => controls[0][id])).toEqual([
      { value: 'up arrow', value2: 'DPAD_UP' },
      { value: 'down arrow', value2: 'DPAD_DOWN' },
      { value: 'left arrow', value2: 'DPAD_LEFT' },
      { value: 'right arrow', value2: 'DPAD_RIGHT' },
    ])
    // EmulatorJS consults every control slot, including unbound analog/hotkey slots.
    expect(Object.keys(controls[0]).map(Number)).toEqual(Array.from({ length: 30 }, (_, index) => index))
  })

  it('resolves runtime assets under a nested collection URL and keeps saves independent of a local filename', () => {
    const bundled = buildEmulatorConfig({ url: 'https://games.example/game.zip', name: 'overboard-europe.zip', size: 100 }, 'https://games.example/ai_games/overboard/')
    const local = buildEmulatorConfig({ url: 'blob:another-disc', name: 'My Overboard backup.zip', size: 200, biosUrl: 'blob:my-bios' }, 'https://games.example/ai_games/overboard/')

    expect(local.EJS_pathtodata).toBe('https://games.example/ai_games/overboard/emulator/')
    expect(local.EJS_core).toBe('pcsx_rearmed')
    expect(local.EJS_gameUrl).toBe('blob:another-disc')
    expect(local.EJS_biosUrl).toBe('')
    expect(local.EJS_externalFiles).toEqual({ '/scph5502.bin': 'blob:my-bios' })
    expect(bundled.EJS_externalFiles).toEqual({})
    expect(bundled.EJS_biosUrl).toBe('')
    expect(local.EJS_gameName).toBe(bundled.EJS_gameName)
    expect(local.EJS_gameName).toBe('Overboard! (Europe)')
    expect(local.EJS_threads).toBe(false)
    expect(local.EJS_CacheLimit).toBe(0)
  })
})

describe('disc and BIOS selection', () => {
  it('accepts the complete imported disc manifest and an optional local BIOS filename', () => {
    expect(readManifest(manifest)).toEqual(manifest)
    expect(readManifest({ ...manifest, bios: 'europe-bios.bin' }).bios).toBe('europe-bios.bin')
  })

  it.each(['../disc.zip', '/disc.zip', 'sub/disc.zip', 'sub\\disc.zip', 'https://evil.example/disc.zip', 'disc%2fother.zip', 'disc.zip?download=1'])(
    'rejects a manifest archive path that can escape its media directory: %s',
    (file) => expect(() => readManifest({ ...manifest, file })).toThrow('Invalid game media manifest'),
  )

  it.each(['../bios.bin', '/bios.bin', 'folder/bios.bin', 'folder\\bios.bin', 'bios%2f.bin'])(
    'rejects a manifest BIOS path that can escape its media directory: %s',
    (bios) => expect(() => readManifest({ ...manifest, bios })).toThrow('Invalid game media manifest'),
  )

  it.each([
    null,
    [],
    { ...manifest, version: 2 },
    { ...manifest, title: 42 },
    { ...manifest, file: 'disc.bin' },
    { ...manifest, size: 0 },
    { ...manifest, size: -1 },
    { ...manifest, size: Number.MAX_SAFE_INTEGER + 1 },
    { ...manifest, tracks: 0 },
    { ...manifest, tracks: 1.5 },
    { ...manifest, bios: 1 },
  ])('rejects unusable manifest data: %j', (value) => {
    expect(() => readManifest(value)).toThrow('Invalid game media manifest')
  })

  it('requires a nonempty ZIP so a lone BIN cannot silently lose the audio tracks', () => {
    expect(() => validateLocalDisc({ name: 'Overboard.ZIP', size: 100 })).not.toThrow()
    for (const file of [{ name: 'disc.bin', size: 100 }, { name: 'disc.cue', size: 100 }, { name: 'disc.zip', size: 0 }]) {
      expect(() => validateLocalDisc(file)).toThrow('every .bin track')
    }
  })

  it('accepts a 512 KiB BIOS dump and rejects truncated or oversized files', () => {
    expect(() => validateBios({ size: 512 * 1024 })).not.toThrow()
    for (const size of [0, 512 * 1024 - 1, 512 * 1024 + 1, 1024 * 1024]) {
      expect(() => validateBios({ size })).toThrow('512 KB')
    }
  })
})

describe('controller availability', () => {
  it('ignores empty browser slots and disconnected pads', () => {
    expect(controllerStatus([null, { connected: false, id: 'Old controller' }])).toContain('Keyboard ready')
    expect(controllerStatus([null, { connected: true, id: 'USB gamepad' }])).toBe('Controller connected · USB gamepad')
    expect(controllerStatus([{ connected: false, id: 'Old controller' }, { connected: true, id: 'First pad' }, { connected: true, id: 'Second pad' }])).toBe('2 controllers connected · First pad')
  })
})
