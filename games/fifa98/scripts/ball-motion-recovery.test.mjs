import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectBallMotionRecovery, ballMotionNativeExports } from './ball-motion-recovery.mjs'

test('unknown ball motion images expose no recovered exports or guessed regions', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(939136)]) {
    const result = inspectBallMotionRecovery(bytes)
    assert.equal(result.status, 'unsupported')
    assert.deepEqual(result.regions, [])
    assert.deepEqual(result.nativeExports, [])
    assert.deepEqual(result.callPath, [])
  }
  assert.throws(() => inspectBallMotionRecovery({}), TypeError)
  assert.equal(ballMotionNativeExports.length, 4)
  assert.ok(Object.isFrozen(ballMotionNativeExports))
})
