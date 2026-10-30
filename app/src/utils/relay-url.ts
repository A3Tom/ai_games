const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** Resolve a configured relay or the standalone localhost development default. */
export function resolveRelayUrl(configuredUrl: string | undefined, pageUrl?: string): string {
  const page = pageUrl ? new URL(pageUrl) : null
  const configured = configuredUrl?.trim() ?? ''
  if (!configured) {
    if (page && LOCAL_HOSTS.includes(page.hostname)) {
      return `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//localhost:14650`
    }
    throw new Error('VITE_RELAY_URL is not configured')
  }

  let url: URL
  const sameOrigin = configured.startsWith('/') && !configured.startsWith('//')
  if (sameOrigin) {
    if (!page) throw new Error('A page origin is required for a relative relay URL')
    url = new URL(configured, page.origin)
    url.protocol = page.protocol === 'https:' ? 'wss:' : 'ws:'
  } else url = new URL(configured)

  if (!['ws:', 'wss:'].includes(url.protocol) || url.hash || url.username || url.password) {
    throw new Error('VITE_RELAY_URL must be a ws:// or wss:// URL without credentials or a fragment')
  }
  if (page?.protocol === 'https:' && url.protocol !== 'wss:') {
    throw new Error('An HTTPS page requires a secure wss:// relay URL')
  }
  return sameOrigin ? url.toString() : configured
}
