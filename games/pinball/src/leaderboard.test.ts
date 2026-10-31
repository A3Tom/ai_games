import { afterEach, describe, expect, it, vi } from 'vitest'

import { LeaderboardApi } from './leaderboard'

const entry = {
  id: 'cadet-1',
  name: 'Cadet',
  score: 123_450,
  createdAt: '2026-10-30T21:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('LeaderboardApi', () => {
  it('uses the same-origin API by default, with a timeout signal and no cached responses', async () => {
    vi.stubEnv('VITE_PINBALL_API_URL', '')
    const fetchMock = vi.fn().mockResolvedValue(json({ scores: [entry] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new LeaderboardApi().list()).toEqual([entry])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pinball/scores',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
        cache: 'no-store',
        credentials: 'omit',
      }),
    )
  })

  it('uses the configured API base and normalizes trailing slashes', async () => {
    vi.stubEnv('VITE_PINBALL_API_URL', 'https://relay.example/api/pinball/')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ scores: [] })))
    vi.stubGlobal('fetch', fetchMock)
    await new LeaderboardApi().list()
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example/api/pinball/scores')
    await new LeaderboardApi(' https://other.example/api/pinball/// ').list()
    expect(fetchMock.mock.calls[1][0]).toBe('https://other.example/api/pinball/scores')
  })

  it('uses runtime configuration ahead of build-time configuration', async () => {
    vi.stubEnv('VITE_PINBALL_API_URL', 'https://build.example/api/pinball')
    vi.stubGlobal('AI_GAMES_PINBALL_CONFIG', { apiUrl: ' https://runtime.example/api/pinball/// ' })
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ scores: [] })))
    vi.stubGlobal('fetch', fetchMock)

    await new LeaderboardApi().list()
    expect(fetchMock.mock.calls[0][0]).toBe('https://runtime.example/api/pinball/scores')

    await new LeaderboardApi('https://explicit.example/api/pinball').list()
    expect(fetchMock.mock.calls[1][0]).toBe('https://explicit.example/api/pinball/scores')
  })

  it.each([undefined, {}, { apiUrl: '' }, { apiUrl: '   ' }, { apiUrl: 123 }])(
    'falls back to build-time configuration when runtime configuration has no URL (%j)',
    async (config) => {
      vi.stubGlobal('AI_GAMES_PINBALL_CONFIG', config)
      vi.stubEnv('VITE_PINBALL_API_URL', ' https://build.example/api/pinball/ ')
      const fetchMock = vi.fn().mockResolvedValue(json({ scores: [] }))
      vi.stubGlobal('fetch', fetchMock)

      await new LeaderboardApi().list()
      expect(fetchMock.mock.calls[0][0]).toBe('https://build.example/api/pinball/scores')
    },
  )

  it('keeps the same-origin default when runtime and build-time URLs are blank', async () => {
    vi.stubGlobal('AI_GAMES_PINBALL_CONFIG', { apiUrl: '' })
    vi.stubEnv('VITE_PINBALL_API_URL', '   ')
    const fetchMock = vi.fn().mockResolvedValue(json({ scores: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await new LeaderboardApi().list()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pinball/scores')
  })

  it('creates a game with JSON and submits the supplied run, name and score', async () => {
    const savedEntry = { ...entry, id: 'run-123' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ runId: 'run-123' }, 201))
      .mockResolvedValueOnce(json({ scores: [savedEntry], entry: savedEntry }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const api = new LeaderboardApi()
    expect(await api.startRun()).toBe('run-123')
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/pinball/runs',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      }),
    ])
    expect(await api.submit('run-123', 'Cadet', 123_450)).toEqual({
      scores: [savedEntry],
      entry: savedEntry,
    })
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/pinball/scores',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ runId: 'run-123', name: 'Cadet', score: 123_450 }),
      }),
    ])
  })

  it('aborts a stalled request after eight seconds and clears its timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const result = expect(new LeaderboardApi().list()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(8000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns an accurate connection error without leaking fetch implementation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal connection details')))
    await expect(new LeaderboardApi().list()).rejects.toThrow(
      'Could not reach the leaderboard server',
    )
  })

  it('uses a short server error message for failed saves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: 'Score could not be saved; please try again' }, 503)),
    )
    await expect(new LeaderboardApi().submit('run', 'Cadet', 100)).rejects.toThrow(
      'Score could not be saved; please try again',
    )
  })

  it.each([
    new Response('<html>Proxy unavailable</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
    json({ error: '<script>Bad error</script>' }, 503),
    json({ error: 'a'.repeat(201) }, 503),
    json({ error: 'bad\u0000error' }, 503),
  ])('uses an accurate fallback for non-JSON or unsafe server failures', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(new LeaderboardApi().list()).rejects.toThrow(
      'The leaderboard server is unavailable',
    )
  })

  it('includes the status for a non-JSON client error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })))
    await expect(new LeaderboardApi().list()).rejects.toThrow('failed (404)')
  })

  it.each([
    new Response('<html>Static host fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    json(null),
    json({}),
    json({ scores: [null] }),
    json({ scores: [{ ...entry, score: '123450' }] }),
    json({ scores: [{ ...entry, score: -1 }] }),
    json({ scores: [{ ...entry, createdAt: 'invalid' }] }),
    json({ scores: [{ ...entry, name: '' }] }),
    json({ scores: [{ ...entry, score: 1_000_000_001 }] }),
    json({ scores: Array.from({ length: 11 }, () => entry) }),
    json({ scores: [entry, entry] }),
    json({
      scores: [
        { ...entry, score: 1 },
        { ...entry, id: 'second', score: 2 },
      ],
    }),
  ])('rejects malformed success responses instead of showing fake scores', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(new LeaderboardApi().list()).rejects.toThrow('invalid response')
  })

  it('rejects a missing run token and a missing saved entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ runId: '' }))
        .mockResolvedValueOnce(json({ scores: [] })),
    )
    const api = new LeaderboardApi()
    await expect(api.startRun()).rejects.toThrow('invalid response')
    await expect(api.submit('run', 'Cadet', 100)).rejects.toThrow('invalid response')
  })
})
