/** Browser bindings to the original digital mapper's low nibble. Bindings are
 * platform choices; combinations and opposing directions are decided in C.
 * Each physical source is tracked separately so releasing W cannot release ↑.
 */
export function createControlInput() {
  const held = new Map()
  const keys = { ArrowRight: 1, KeyD: 1, ArrowLeft: 2, KeyA: 2,
    ArrowUp: 4, KeyW: 4, ArrowDown: 8, KeyS: 8 }
  return {
    key(code, down) {
      if (!Object.hasOwn(keys, code)) return false
      if (down) held.set(`key:${code}`, keys[code]); else held.delete(`key:${code}`)
      return true
    },
    pointer(id, bits, down) {
      if (!Number.isInteger(id) || !Number.isInteger(bits) || bits < 1 || bits > 15) throw new Error('Invalid directional pointer')
      if (down) held.set(`pointer:${id}`, bits); else held.delete(`pointer:${id}`)
    },
    clear() { held.clear() },
    get buttons() { let bits = 0; for (const value of held.values()) bits |= value; return bits },
  }
}
