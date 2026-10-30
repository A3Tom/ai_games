import { describe, expect, it } from 'vitest'

import { resolveRelayUrl } from './relay-url'

describe('relay URL selection', () => {
  it('resolves the composed HTTP LAN relay using the browser host and exposed port', () => {
    expect(resolveRelayUrl('/relay', 'http://192.168.1.20:8080/sea-strike/'))
      .toBe('ws://192.168.1.20:8080/relay')
  })

  it('uses wss automatically for an HTTPS proxy', () => {
    expect(resolveRelayUrl('/relay', 'https://games.example.test/sea-strike/'))
      .toBe('wss://games.example.test/relay')
  })

  it('defaults standalone localhost development to the relay dev port', () => {
    expect(resolveRelayUrl('', 'http://localhost:5173/sea-strike/')).toBe('ws://localhost:8080')
    expect(resolveRelayUrl('', 'https://localhost:5173/sea-strike/')).toBe('wss://localhost:8080')
  })

  it('requires configuration on Pages and remote LAN builds without the proxy setting', () => {
    expect(() => resolveRelayUrl('', 'https://a3tom.github.io/ai_games/sea-strike/'))
      .toThrow('VITE_RELAY_URL is not configured')
    expect(() => resolveRelayUrl(undefined, 'http://192.168.1.20/sea-strike/'))
      .toThrow('VITE_RELAY_URL is not configured')
  })

  it('retains explicit external secure relay URLs', () => {
    expect(resolveRelayUrl('wss://relay.example.test/socket', 'https://a3tom.github.io/ai_games/sea-strike/'))
      .toBe('wss://relay.example.test/socket')
  })

  it('rejects insecure relays from an HTTPS page and credentials or fragments', () => {
    expect(() => resolveRelayUrl('ws://relay.example.test', 'https://games.example.test/'))
      .toThrow('requires a secure wss://')
    expect(() => resolveRelayUrl('wss://user:secret@relay.example.test'))
      .toThrow('without credentials or a fragment')
    expect(() => resolveRelayUrl('wss://relay.example.test/#fragment'))
      .toThrow('without credentials or a fragment')
  })

  it('rejects HTTP and protocol-relative addresses', () => {
    expect(() => resolveRelayUrl('http://relay.example.test')).toThrow('ws:// or wss://')
    expect(() => resolveRelayUrl('//elsewhere/relay', 'http://192.168.1.20/')).toThrow()
  })
})
