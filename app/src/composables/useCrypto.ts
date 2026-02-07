import type { PlacedShip } from '../types/game'

export interface CommitResult {
  hash: string // 64-character lowercase hex SHA-256
  salt: Uint8Array // 32 random bytes
  saltHex: string // 64-character lowercase hex encoding of salt
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(new Uint8Array(hashBuffer))
}

export function isCryptoAvailable(): boolean {
  return !!globalThis.crypto?.subtle
}

export async function commitBoard(ships: PlacedShip[]): Promise<CommitResult> {
  const sortedShips = [...ships].sort((a, b) => a.type.localeCompare(b.type))
  const canonical = JSON.stringify(sortedShips)
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const saltHex = toHex(salt)
  const payload = canonical + ':' + saltHex
  const hash = await sha256(payload)
  return { hash, salt, saltHex }
}

export async function verifyBoard(
  opponentShips: PlacedShip[],
  opponentSaltHex: string,
  opponentHash: string,
): Promise<boolean> {
  const canonical = JSON.stringify(opponentShips)
  const payload = canonical + ':' + opponentSaltHex
  const recomputedHash = await sha256(payload)
  return recomputedHash === opponentHash
}

export function useCrypto(): {
  commitBoard: typeof commitBoard
  verifyBoard: typeof verifyBoard
  isAvailable: boolean
} {
  const isAvailable = isCryptoAvailable()
  return { commitBoard, verifyBoard, isAvailable }
}
