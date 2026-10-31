import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { hostname } from 'node:os'

import type { RelayStats } from './types.js'
import { isRecord } from './types.js'

const levels = { debug: 10, info: 20, warn: 30, error: 40 }
type Level = keyof typeof levels
export type Logger = (level: Level, event: string, fields?: Record<string, unknown>) => void

function formatLog(level: Level, event: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    service: 'ai-games',
    instance: process.env.INSTANCE_ID || hostname(),
    environment: process.env.OBSERVABILITY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    source: 'relay', appId: 'relay', message: event,
    ...fields, timestamp: new Date().toISOString(), level, event,
  })
}

export const consoleLogger: Logger = (level, event, fields) => {
  console.log(formatLog(level, event, fields))
}

interface BrowserLog {
  level: Level
  event: string
  message: string
  stack?: string
  context?: Record<string, string | number | boolean | null>
  durationMs?: number
}

function isBrowserLog(value: unknown): value is BrowserLog {
  return isRecord(value) && typeof value.level === 'string' && Object.hasOwn(levels, value.level) &&
    typeof value.event === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(value.event) &&
    typeof value.message === 'string' && value.message.length <= 1000 &&
    (value.stack === undefined || (typeof value.stack === 'string' && value.stack.length <= 4000)) &&
    (value.durationMs === undefined || (typeof value.durationMs === 'number' &&
      Number.isFinite(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 600_000)) &&
    (value.context === undefined || (isRecord(value.context) && Object.keys(value.context).length <= 10 &&
      Object.entries(value.context).every(([key, item]) => /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/.test(key) &&
        (item === null || typeof item === 'boolean' ||
          (typeof item === 'number' && Number.isFinite(item)) ||
          (typeof item === 'string' && item.length <= 200)))))
}

// Keep browser input, error strings and room IDs out of metric labels.
interface BrowserMetrics { logs: Record<Level, number>; loads: number; loadSeconds: number; loadDurations: number }
interface HttpMetrics { count: number; seconds: number }

export class Observability {
  private readonly minimumLevel: number
  private readonly endpoint: URL | undefined
  private readonly allowedOrigins = new Set((process.env.TELEMETRY_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean))
  private readonly queue: string[] = []
  private pending: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private readonly timer: ReturnType<typeof setInterval>
  private readonly browser = new Map<string, BrowserMetrics>()
  private readonly http = new Map<string, HttpMetrics>()
  private readonly emitted = new Map<string, number>()
  private forwardFailures = 0
  private dropped = 0
  private intakeCount = 0
  private intakeWindow = Date.now()

  constructor(logLevel: string, private readonly getStats: () => RelayStats) {
    this.minimumLevel = levels[logLevel as Level] ?? levels.info
    if (process.env.VICTORIALOGS_URL) {
      this.endpoint = new URL(process.env.VICTORIALOGS_URL)
      if (!['http:', 'https:'].includes(this.endpoint.protocol)) throw new Error('VICTORIALOGS_URL must use HTTP or HTTPS')
      this.endpoint.pathname = `${this.endpoint.pathname.replace(/\/$/, '')}/insert/jsonline`
    }
    this.timer = setInterval(() => { void this.flush() }, 1000)
    this.timer.unref()
  }

  readonly log: Logger = (level, event, fields = {}) => {
    if (levels[level] < this.minimumLevel) return
    const line = formatLog(level, event, fields)
    console.log(line)
    const key = `${fields.source === 'browser' ? 'browser' : 'relay'}|${level}`
    this.emitted.set(key, (this.emitted.get(key) ?? 0) + 1)
    if (!this.endpoint || this.closing) return
    if (this.queue.length < 1000) this.queue.push(line)
    else this.dropped++
  }

  private flush(batchSize = 100): Promise<void> {
    if (this.pending) return this.pending
    if (!this.endpoint || this.queue.length === 0) return Promise.resolve()
    const lines = this.queue.splice(0, batchSize)
    this.pending = (async () => {
      try {
        const response = await fetch(this.endpoint!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/stream+json',
            'VL-Time-Field': 'timestamp', 'VL-Msg-Field': 'message',
            'VL-Stream-Fields': 'service,instance,environment,source,appId',
            ...(process.env.VICTORIALOGS_TOKEN ? { Authorization: `Bearer ${process.env.VICTORIALOGS_TOKEN}` } : {}),
          },
          body: `${lines.join('\n')}\n`, signal: AbortSignal.timeout(3000),
        })
        await response.body?.cancel()
        if (!response.ok) throw new Error('Log backend rejected batch')
      } catch {
        this.forwardFailures++
        this.dropped += lines.length
        // Never forward failures back into the same failing sink.
        consoleLogger('warn', 'log_forward_failed', { message: 'Log batch discarded; JSON logs remain on stdout', context: { entries: lines.length } })
      } finally {
        this.pending = undefined
      }
    })()
    return this.pending
  }

  close(): Promise<void> {
    if (!this.closing) {
      clearInterval(this.timer)
      this.closing = (async () => {
        await this.pending
        await this.flush(1000)
      })()
    }
    return this.closing
  }

  wrap(fallback: RequestListener): RequestListener {
    return (req, res) => {
      const path = req.url?.split('?')[0]
      const route = path === '/telemetry' ? 'telemetry' :
        path?.startsWith('/api/pinball/') ? 'pinball' :
        path === '/metrics' || path === '/relay/metrics' ? 'metrics' :
          path === '/health' || path === '/relay/health' ? 'health' : 'static'
      const started = performance.now()
      res.once('finish', () => {
        const method = ['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method ?? '') ? req.method : 'other'
        const key = `${route}|${method}|${Math.floor(res.statusCode / 100)}xx`
        const metric = this.http.get(key) ?? { count: 0, seconds: 0 }
        metric.count++
        metric.seconds += (performance.now() - started) / 1000
        this.http.set(key, metric)
      })
      if (route === 'telemetry') {
        this.receive(req, res)
      } else if (route === 'metrics' && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(req.method === 'HEAD' ? undefined : this.metrics())
      } else fallback(req, res)
    }
  }

  private receive(req: IncomingMessage, res: ServerResponse): void {
    const reply = (status: number): void => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end() }
    const origin = req.headers.origin
    if (origin) {
      let sameHost = false
      try { sameHost = new URL(origin).host === req.headers.host } catch { /* Invalid origins are denied. */ }
      if (!sameHost && !this.allowedOrigins.has(origin)) { reply(403); req.resume(); return }
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      reply(204)
      return
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); reply(405); req.resume(); return }
    if (!/^(application\/json|text\/plain)(;|$)/i.test(req.headers['content-type'] ?? '')) { reply(415); req.resume(); return }
    if (Date.now() - this.intakeWindow >= 60_000) { this.intakeWindow = Date.now(); this.intakeCount = 0 }
    if (++this.intakeCount > 600) { res.setHeader('Retry-After', '60'); reply(429); req.resume(); return }
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) { if (!res.writableEnded) reply(413); return }
      chunks.push(chunk)
    })
    req.on('error', () => { if (!res.writableEnded) reply(400) })
    req.on('end', () => {
      if (res.writableEnded) return
      let batch: unknown
      try { batch = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { reply(400); return }
      if (!isRecord(batch) || typeof batch.appId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(batch.appId) ||
          !Array.isArray(batch.logs) || batch.logs.length < 1 || batch.logs.length > 10 || !batch.logs.every(isBrowserLog)) {
        reply(400)
        return
      }
      const appId = batch.appId
      // New games work without server changes; at most 32 individual app labels.
      const label = this.browser.has(appId) || this.browser.size < 32 ? appId : 'other'
      const metric = this.browser.get(label) ?? { logs: { debug: 0, info: 0, warn: 0, error: 0 }, loads: 0, loadSeconds: 0, loadDurations: 0 }
      this.browser.set(label, metric)
      for (const entry of batch.logs as BrowserLog[]) {
        metric.logs[entry.level]++
        if (entry.event === 'page_loaded') {
          metric.loads++
          if (entry.durationMs !== undefined) {
            metric.loadSeconds += entry.durationMs / 1000
            metric.loadDurations++
          }
        }
        this.log(entry.level, entry.event, {
          source: 'browser', appId, message: entry.message,
          ...(entry.stack !== undefined ? { stack: entry.stack } : {}),
          ...(entry.context !== undefined ? { context: entry.context } : {}),
          ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
        })
      }
      reply(204)
    })
  }

  private metrics(): string {
    const lines: string[] = []
    const metric = (name: string, type: string, help: string, samples: [string, number][]): void => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
      for (const [labels, value] of samples) lines.push(`${name}${labels} ${value}`)
    }
    const stats = this.getStats()
    for (const [suffix, type, help, value] of [
      ['uptime_seconds', 'gauge', 'Relay process uptime in seconds.', stats.uptimeSeconds],
      ['rooms', 'gauge', 'Active relay rooms.', stats.rooms],
      ['players', 'gauge', 'Players in relay rooms.', stats.players],
      ['connections', 'gauge', 'Open relay WebSocket connections.', stats.connections],
      ['messages_received_total', 'counter', 'WebSocket messages received.', stats.messagesReceived],
      ['messages_forwarded_total', 'counter', 'Peer message deliveries.', stats.messagesForwarded],
      ['messages_rejected_total', 'counter', 'WebSocket messages rejected.', stats.rejectedMessages],
      ['bytes_received_total', 'counter', 'WebSocket bytes received.', stats.bytesReceived],
      ['bytes_sent_total', 'counter', 'WebSocket bytes sent.', stats.bytesSent],
      ['log_forward_failures_total', 'counter', 'Failed VictoriaLogs batches.', this.forwardFailures],
      ['log_forward_dropped_total', 'counter', 'Logs dropped by the bounded VictoriaLogs forwarder.', this.dropped],
      ['log_forward_queue', 'gauge', 'Logs waiting for VictoriaLogs forwarding.', this.queue.length],
      ['process_resident_memory_bytes', 'gauge', 'Relay resident memory in bytes.', process.memoryUsage().rss],
      ['process_cpu_seconds_total', 'counter', 'Relay user and system CPU time.', (process.cpuUsage().user + process.cpuUsage().system) / 1e6],
    ] as const) metric(`ai_games_${suffix}`, type, help, [['', value]])

    const browsers = [...this.browser.entries()]
    metric('ai_games_browser_logs_total', 'counter', 'Accepted browser log entries.', browsers.flatMap(([app, m]) =>
      Object.entries(m.logs).map(([level, count]) => [`{app_id="${app}",level="${level}"}`, count] as [string, number])))
    metric('ai_games_page_loads_total', 'counter', 'Reported browser page loads.', browsers.map(([app, m]) => [`{app_id="${app}"}`, m.loads]))
    metric('ai_games_page_load_duration_seconds_sum', 'counter', 'Sum of reported navigation load durations.', browsers.map(([app, m]) => [`{app_id="${app}"}`, m.loadSeconds]))
    metric('ai_games_page_load_duration_seconds_count', 'counter', 'Number of reported navigation load durations.', browsers.map(([app, m]) => [`{app_id="${app}"}`, m.loadDurations]))
    metric('ai_games_log_entries_total', 'counter', 'JSON log entries emitted to stdout.', [...this.emitted].map(([key, count]) => {
      const [source, level] = key.split('|')
      return [`{source="${source}",level="${level}"}`, count]
    }))
    for (const [suffix, help, value] of [
      ['requests_total', 'Completed HTTP requests.', 'count'],
      ['request_duration_seconds_sum', 'Sum of HTTP request durations.', 'seconds'],
      ['request_duration_seconds_count', 'Number of HTTP request durations.', 'count'],
    ] as const) {
      metric(`ai_games_http_${suffix}`, 'counter', help, [...this.http].map(([key, m]) => {
        const [route, method, status] = key.split('|')
        return [`{route="${route}",method="${method}",status_class="${status}"}`, m[value]]
      }))
    }
    return `${lines.join('\n')}\n`
  }
}
