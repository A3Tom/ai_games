import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {inspectBallFlightRecovery,ballFlightNativeExports} from './ball-flight-recovery.mjs'

test('unknown/truncated source images are refused without inferred flight tables',()=>{
  for(const[backend,boot]of[[new Uint8Array(),new Uint8Array()],[new Uint8Array(939136),new Uint8Array(251904)],[new Uint8Array(939135),new Uint8Array(251904)]]){
    const result=inspectBallFlightRecovery(backend,boot)
    assert.equal(result.status,'unsupported');assert.equal(result.profile,undefined);assert.deepEqual(result.regions,[]);assert.deepEqual(result.tables,{})
  }
  assert.throws(()=>inspectBallFlightRecovery({},new Uint8Array()),/Uint8Array/)
  assert.equal(ballFlightNativeExports.length,5);assert.ok(Object.isFrozen(ballFlightNativeExports))
})

test('actual source gates builders, coefficient words, wrapper spin and explicit duration scope',async(context)=>{
  let backend,boot
  try{[backend,boot]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url))])}
  catch(error){if(error.code==='ENOENT'){context.skip('Original reference files are not prepared');return}throw error}
  const result=inspectBallFlightRecovery(backend,boot)
  assert.equal(result.status,'reconstruction-only');assert.equal(result.regions.length,6)
  assert.deepEqual(result.tables.spin.values,[2000,3000,3000,4000,4000,4000,5000,5000,5000,6000,6000,6000,7000,7000,8000,8000])
  assert.deepEqual(result.tables.coefficients.values.slice(0,3).map(value=>value|0),[65536,-208360,-3006669])
  assert.equal(result.tables.coefficients.values[9],832149)
  assert.equal(result.tables.coefficients.values[11]|0,-2386092)
  assert.equal(result.gravity.sourceWord,0xfe000000)
  assert.equal(result.generatedTables[0].count,320);assert.equal(result.generatedTables[1].count,320)
  assert.equal(result.generatedTables[1].arguments.drag,203)
  assert.equal(result.generatedTables[1].arguments.spinDecay,0xf9db)
  assert.equal(result.inspectionFixture.duration,60)
  assert.match(result.inspectionFixture.label,/no named action/)
  const changed=new Uint8Array(backend);changed[0x8007c590-0x8005ae28]^=1
  assert.equal(inspectBallFlightRecovery(changed,boot).status,'unsupported')
})
