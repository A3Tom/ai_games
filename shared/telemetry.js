// Browser diagnostics use the relay, so games never need backend credentials.
const queue = []
let appId
let endpoint
let timer
let sending = false

function text(value, limit = 1000) {
  try {
    return String(value ?? '')
      // Invite links can contain room IDs in their query or fragment.
      .replace(/https?:\/\/[^\s<>"')]+/g, (url) => url.replace(/[?#].*$/, ''))
      .slice(0, limit)
  } catch {
    return '[unavailable]'
  }
}

function contextFields(context) {
  const fields = {}
  if (!context || typeof context !== 'object') return fields
  for (const key of Object.keys(context).slice(0, 10)) {
    const value = context[key]
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue
    if (typeof value === 'string') fields[key] = text(value, 200)
    else if (typeof value === 'boolean' || value === null) fields[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) fields[key] = value
  }
  return fields
}

function scheduleFlush() {
  if (!timer && queue.length && endpoint) timer = setTimeout(() => flush(), 2000)
}

function flush(unloading = false) {
  clearTimeout(timer)
  timer = undefined
  if (!endpoint || !queue.length || (sending && !unloading)) return
  const logs = []
  let bytes = 0
  while (queue.length && logs.length < 10) {
    const size = new TextEncoder().encode(JSON.stringify(queue[0])).length
    if (logs.length && bytes + size > 32 * 1024) break
    logs.push(queue.shift())
    bytes += size
  }
  const body = JSON.stringify({ appId, logs })
  try {
    if (unloading && navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) {
      if (queue.length) flush(true)
      return
    }
    sending = true
    // Failures are deliberately silent and batches are never retried.
    fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {}).finally(() => {
      sending = false
      scheduleFlush()
    })
  } catch {
    sending = false
    scheduleFlush()
  }
}

function write(level, event, message, context, extra = {}) {
  // Diagnostics must never throw into a game, including for unusual error objects.
  try {
    const entry = {
      level,
      event: /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(event) ? event : 'game_log',
      message: text(message),
      context: contextFields(context),
      ...extra,
    }
    console[level](`[${appId || 'game'}] ${entry.event}: ${entry.message}`, entry.context)
    if (!appId || !endpoint) return
    if (queue.length >= 50) queue.shift()
    queue.push(entry)
    if (queue.length >= 10) flush()
    else scheduleFlush()
  } catch {
    // Logging is best effort, even if a browser extension replaces console methods.
  }
}

export const telemetry = {
  debug: (event, message, context) => write('debug', event, message, context),
  info: (event, message, context) => write('info', event, message, context),
  warn: (event, message, context) => write('warn', event, message, context),
  error: (event, message, context) => write('error', event, message, context),
  captureError(event, error, context) {
    try {
      write('error', event, error?.message ?? error, context,
        typeof error?.stack === 'string' ? { stack: text(error.stack, 2000) } : {})
    } catch {
      write('error', event, 'Unknown error', context)
    }
  },
}

export function initializeTelemetry(id) {
  if (appId || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id || '')) return
  appId = id
  try {
    const configured = document.querySelector('meta[name="telemetry-endpoint"]')?.content ?? '/telemetry'
    if (configured !== 'off') {
      const url = new URL(configured, location.href)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (!url.username && !url.password && !url.hash &&
          (url.protocol === 'https:' || (url.protocol === 'http:' && (url.origin === location.origin || local)))) {
        endpoint = url.href
      }
    }
  } catch {
    // A bad telemetry URL must not stop a game loading.
  }

  window.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent) {
      telemetry.captureError('javascript_error', event.error ?? event.message)
    } else {
      const target = event.target
      write('error', 'resource_error', 'A page resource could not be loaded', {
        resource: text(target?.src || target?.href || target?.tagName || 'unknown', 200),
      })
    }
  }, true)
  window.addEventListener('unhandledrejection', (event) => {
    telemetry.captureError('unhandled_rejection', event.reason)
  })
  const loaded = () => write('info', 'page_loaded', 'Game page loaded', undefined, {
    durationMs: Math.min(600000, Math.max(0, Math.round(performance.now()))),
  })
  if (document.readyState === 'complete') loaded()
  else window.addEventListener('load', loaded, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}
