import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadBundledResources, loadLocalResources } from './resources'

function file(name: string, content: string, relativePath = '', declaredSize?: number): File {
  const bytes = new TextEncoder().encode(content)
  return {
    name,
    webkitRelativePath: relativePath,
    size: declaredSize ?? bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

function manifest(files: unknown, version = 1): Response {
  return new Response(JSON.stringify({ version, files }))
}

afterEach(() => vi.unstubAllGlobals())

describe('local game resources', () => {
  it('strips the folder picker root, uppercases names, and preserves sound subfolders', async () => {
    const result = await loadLocalResources([
      file('pinball.dat', 'table', 'Pinball/pinball.dat'),
      file('sound.wav', 'sound', 'Pinball/Sound/sound.wav'),
      file('pinball.exe', 'ignored', 'Pinball/pinball.exe'),
    ])
    expect(result.map((item) => item.path)).toEqual(['PINBALL.DAT', 'SOUND/SOUND.WAV'])
    expect(new TextDecoder().decode(result[0].data)).toBe('table')
  })

  it('allows selecting individual resources without a directory picker', async () => {
    expect((await loadLocalResources([file('CADET.DAT', 'data')]))[0].path).toBe('CADET.DAT')
  })

  it('requires a recognized table file at the resource root', async () => {
    await expect(loadLocalResources([file('sound.wav', 'sound')])).rejects.toThrow('must contain')
    await expect(loadLocalResources([file('custom.dat', 'table')])).rejects.toThrow('must contain')
  })

  it.each(['../PINBALL.DAT', '/PINBALL.DAT', 'Root/../PINBALL.DAT', 'Root/a\\PINBALL.DAT'])(
    'rejects unsafe paths: %s',
    async (unsafe) => {
      await expect(loadLocalResources([file('PINBALL.DAT', 'table', unsafe)])).rejects.toThrow(
        'invalid file path',
      )
    },
  )

  it('rejects case-insensitive duplicate paths before loading bytes', async () => {
    await expect(
      loadLocalResources([file('pinball.dat', 'a'), file('PINBALL.DAT', 'b')]),
    ).rejects.toThrow('duplicate')
  })

  it('rejects empty, oversized, or changed files', async () => {
    await expect(loadLocalResources([file('PINBALL.DAT', '')])).rejects.toThrow('between 1 byte')
    await expect(
      loadLocalResources([file('PINBALL.DAT', 'a', '', 33 * 1024 * 1024)]),
    ).rejects.toThrow('32 MB')
    await expect(loadLocalResources([file('PINBALL.DAT', 'a', '', 2)])).rejects.toThrow(
      'read completely',
    )
  })
})

describe('hosted game resources', () => {
  it('returns null only when the host has no resource manifest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    expect(await loadBundledResources('./game-data/')).toBeNull()
  })

  it('loads a versioned manifest and each resource relative to the game URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(manifest(['pinball.dat', 'Sound/sound.wav']))
      .mockResolvedValueOnce(new Response('table'))
      .mockResolvedValueOnce(new Response('audio'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadBundledResources('./game-data/')
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      './game-data/manifest.json',
      './game-data/pinball.dat',
      './game-data/Sound/sound.wav',
    ])
    expect(result?.map((item) => item.path)).toEqual(['PINBALL.DAT', 'SOUND/SOUND.WAV'])
    expect(new TextDecoder().decode(result![0].data)).toBe('table')
  })

  it.each([
    ['../PINBALL.DAT'],
    ['https://evil.example/PINBALL.DAT'],
    ['/PINBALL.DAT'],
    ['PINBALL.DAT', 'pinball.dat'],
    ['PINBALL.EXE'],
    ['PINBALL.DAT', 'sound%2Fbad.wav'],
  ])('rejects malformed manifest paths without requesting resources: %j', async (...names) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(manifest(names))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadBundledResources('./game-data')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports missing resource files and invalid manifests', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(manifest(['PINBALL.DAT']))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    )
    await expect(loadBundledResources('./game-data')).rejects.toThrow(
      'PINBALL.DAT could not be loaded',
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(manifest(['PINBALL.DAT'], 2)))
    await expect(loadBundledResources('./game-data')).rejects.toThrow('manifest is invalid')
  })

  it('rejects declared large files before reading the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(manifest(['PINBALL.DAT']))
        .mockResolvedValueOnce(
          new Response('table', { headers: { 'Content-Length': String(33 * 1024 * 1024) } }),
        ),
    )
    await expect(loadBundledResources('./game-data')).rejects.toThrow('32 MB')
  })
})
