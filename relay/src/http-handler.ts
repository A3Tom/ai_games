import http from 'node:http'

import serveStatic from 'serve-static'

import { createHealthHandler } from './health.js'
import { createPinballHandler } from './pinball-scores.js'

export function createHttpHandler(
  getStats: () => { rooms: number; connections: number },
  staticDir?: string,
): http.RequestListener {
  const health = createHealthHandler(getStats)
  const pinball = createPinballHandler()
  const files = staticDir ? serveStatic(staticDir, { dotfiles: 'deny', fallthrough: false }) : undefined
  return (req, res): void => {
    if (req.url?.split('?')[0]?.startsWith('/api/pinball/')) {
      pinball(req, res)
      return
    }
    if (req.url === '/health' || req.url === '/relay/health') {
      health(req, res)
      return
    }

    if (!files) { health(req, res); return }
    files(req, res, (error: unknown): void => {
      if (!error) {
        health(req, res)
        return
      }
      if (res.headersSent) {
        res.destroy()
        return
      }

      const status = typeof error === 'object' && 'statusCode' in error &&
        typeof error.statusCode === 'number' && Number.isInteger(error.statusCode) &&
        error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500
      const message = status >= 500 ? 'Internal server error' : http.STATUS_CODES[status] ?? 'Request failed'
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    })
  }
}
