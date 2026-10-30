export interface ScoreEntry {
  id: string
  name: string
  score: number
  createdAt: string
}

const INVALID_RESPONSE = 'The leaderboard server returned an invalid response.'
const REQUEST_TIMEOUT_MS = 8000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(value: unknown): ScoreEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    value.name.trim().length < 1 ||
    value.name.length > 16 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value.name) ||
    typeof value.score !== 'number' ||
    !Number.isSafeInteger(value.score) ||
    value.score < 0 ||
    value.score > 1_000_000_000 ||
    typeof value.createdAt !== 'string' ||
    value.createdAt.length > 64 ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    throw new Error(INVALID_RESPONSE)
  }
  return { id: value.id, name: value.name, score: value.score, createdAt: value.createdAt }
}

function parseScores(value: unknown): ScoreEntry[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error(INVALID_RESPONSE)
  const scores = value.map(parseEntry)
  if (
    new Set(scores.map((entry) => entry.id)).size !== scores.length ||
    scores.some((entry, index) => index > 0 && entry.score > scores[index - 1].score)
  ) {
    throw new Error(INVALID_RESPONSE)
  }
  return scores
}

export class LeaderboardApi {
  private readonly base: string

  constructor(base = import.meta.env.VITE_PINBALL_API_URL || '/api/pinball') {
    this.base = base.trim().replace(/\/+$/, '') || '/api/pinball'
  }

  private async request(route: string, body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      let response: Response
      try {
        response = await fetch(`${this.base}/${route}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
        })
      } catch {
        if (controller.signal.aborted)
          throw new Error('The leaderboard request timed out. Please try again.')
        throw new Error('Could not reach the leaderboard server. Please try again.')
      }
      let payload: unknown
      if (/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
        try {
          payload = await response.json()
        } catch {
          /* Treat an invalid JSON body as an invalid response. */
        }
      }
      if (controller.signal.aborted)
        throw new Error('The leaderboard request timed out. Please try again.')
      if (!response.ok) {
        if (
          isRecord(payload) &&
          typeof payload.error === 'string' &&
          payload.error.trim().length > 0 &&
          payload.error.length <= 200 &&
          !/[<>\u0000-\u001f\u007f-\u009f]/.test(payload.error)
        ) {
          throw new Error(payload.error)
        }
        throw new Error(
          response.status >= 500
            ? 'The leaderboard server is unavailable. Please try again.'
            : `The leaderboard request failed (${response.status}). Please try again.`,
        )
      }
      if (!isRecord(payload)) throw new Error(INVALID_RESPONSE)
      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  async list(): Promise<ScoreEntry[]> {
    const body = await this.request('scores')
    return parseScores(body.scores)
  }

  async startRun(): Promise<string> {
    const body = await this.request('runs', {})
    if (typeof body.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.runId))
      throw new Error(INVALID_RESPONSE)
    return body.runId
  }

  async submit(
    runId: string,
    name: string,
    score: number,
  ): Promise<{ scores: ScoreEntry[]; entry: ScoreEntry }> {
    const body = await this.request('scores', { runId, name, score })
    const entry = parseEntry(body.entry)
    if (entry.id !== runId || entry.name !== name.trim() || entry.score !== score)
      throw new Error(INVALID_RESPONSE)
    return { scores: parseScores(body.scores), entry }
  }
}
