import test from 'node:test'
import assert from 'node:assert/strict'
import { createControlInput } from './control-input.mjs'

test('physical aliases, repeats and multiple pointers release independently', () => {
  const input = createControlInput()
  assert.equal(input.key('KeyW', true), true)
  input.key('KeyW', true); input.key('ArrowUp', true); input.key('ArrowRight', true)
  assert.equal(input.buttons, 5)
  input.key('KeyW', false)
  assert.equal(input.buttons, 5)
  input.pointer(1, 8, true); input.pointer(2, 8, true)
  assert.equal(input.buttons, 13, 'opposing inputs are passed intact to original mapper')
  input.pointer(1, 8, false); input.key('ArrowUp', false); input.key('ArrowRight', false)
  assert.equal(input.buttons, 8)
  assert.equal(input.key('Space', true), false)
  input.clear(); assert.equal(input.buttons, 0)
})
