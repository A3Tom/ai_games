import { IncomingMessage, ServerResponse } from 'node:http'

export interface HealthResponse {
  status: 'ok'
  rooms: number
  connections: number
}

type StatsProvider = () => { rooms: number; connections: number }

export function createHealthHandler(
  getStats: StatsProvider
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    try {
      const stats = getStats()
      const response: HealthResponse = {
        status: 'ok',
        rooms: stats.rooms,
        connections: stats.connections,
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      })
      res.end(JSON.stringify(response))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  }
}
