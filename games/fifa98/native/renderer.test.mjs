import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const module = await WebAssembly.compile(bytes)
const { exports: renderer } = await WebAssembly.instantiate(module)
const names = ['fifa98_mesh_vertices', 'fifa98_mesh_indices', 'fifa98_mesh_colours', 'fifa98_mesh_texture', 'fifa98_mesh_rgba',
  'fifa98_mesh_vertex_capacity', 'fifa98_mesh_triangle_capacity', 'fifa98_mesh_texture_capacity', 'fifa98_mesh_begin', 'fifa98_mesh_draw', 'fifa98_render_mesh']
for (const name of names) assert.equal(typeof renderer[name], 'function', `Rebuild the native core with renderer.c: missing ${name}`)

const RED = 0xff0000ff, GREEN = 0xff00ff00, BLUE = 0xffff0000, BLACK = 0xff000000, WHITE = 0xffffffff
function upload(vertices, indices = [0, 1, 2], colours = [RED]) {
  new Float32Array(renderer.memory.buffer, renderer.fifa98_mesh_vertices(), vertices.length).set(vertices)
  new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_indices(), indices.length).set(indices)
  new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_colours(), colours.length).set(colours)
}
const triangle = (z = 1) => [0, 0, z, 0, 0, 8, 0, z, 1, 0, 0, 8, z, 0, 1]
const pixels = (width = 8, height = 8) => new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_rgba(), width * height)

test('native rasterizer fills shared edges without cracks and accepts both windings', () => {
  const vertices = [...triangle(), 8, 8, 1, 1, 1]
  upload(vertices, [0, 1, 2, 1, 3, 2], [RED, RED])
  assert.equal(renderer.fifa98_render_mesh(4, 2, 8, 8, 0, 0, BLACK), 64)
  assert.deepEqual([...pixels()], Array(64).fill(RED))
  upload(vertices, [2, 1, 0, 2, 3, 1], [RED, RED])
  assert.equal(renderer.fifa98_render_mesh(4, 2, 8, 8, 0, 0, BLACK), 64)
  assert.deepEqual([...pixels()], Array(64).fill(RED))
})

test('depth persists across texture batches and nearer geometry wins in either draw order', () => {
  renderer.fifa98_mesh_begin(8, 8, BLACK)
  upload(triangle(2), [0, 1, 2], [RED])
  assert.ok(renderer.fifa98_mesh_draw(3, 1, 0, 0) > 0)
  upload(triangle(1), [0, 1, 2], [GREEN])
  assert.ok(renderer.fifa98_mesh_draw(3, 1, 0, 0) > 0)
  assert.equal(pixels()[0], GREEN)
  upload(triangle(3), [0, 1, 2], [BLUE])
  assert.equal(renderer.fifa98_mesh_draw(3, 1, 0, 0), 0)
  assert.equal(pixels()[0], GREEN)
  renderer.fifa98_mesh_begin(8, 8, BLACK)
  upload(triangle(1), [0, 1, 2], [GREEN])
  renderer.fifa98_mesh_draw(3, 1, 0, 0)
  upload(triangle(2), [0, 1, 2], [RED])
  assert.equal(renderer.fifa98_mesh_draw(3, 1, 0, 0), 0)
  assert.equal(pixels()[0], GREEN)
})

test('perspective-correct UVs differ from affine mapping and transparent texels do not occlude', () => {
  // At pixel(3,1), screen barycentrics are(0.375,0.4375,0.1875).
  // With depth(1,4,1), perspective U is0.109375/0.671875<0.25,
  // while affine U is0.4375. Four texels make this observable.
  upload([0, 0, 1, 0, 0, 8, 0, 4, 1, 0, 0, 8, 1, 0, 0], [0, 1, 2], [WHITE])
  new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_texture(), 4).set([RED, GREEN, BLUE, WHITE])
  assert.ok(renderer.fifa98_render_mesh(3, 1, 8, 8, 4, 1, BLACK) > 0)
  assert.equal(pixels()[1 * 8 + 3], RED)
  new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_texture(), 4).fill(0)
  renderer.fifa98_mesh_begin(8, 8, BLACK)
  assert.equal(renderer.fifa98_mesh_draw(3, 1, 4, 1), 0)
  upload(triangle(9), [0, 1, 2], [BLUE])
  assert.ok(renderer.fifa98_mesh_draw(3, 1, 0, 0) > 0)
  assert.equal(pixels()[0], BLUE)
})

test('offscreen and degenerate triangles clip safely; texture edges clamp', () => {
  upload([-100, -100, 1, -4, 2, 100, -100, 1, -4, 2, 0, 100, 1, -4, 2], [0, 1, 2], [WHITE])
  new Uint32Array(renderer.memory.buffer, renderer.fifa98_mesh_texture(), 4).set([RED, GREEN, BLUE, WHITE])
  assert.equal(renderer.fifa98_render_mesh(3, 1, 8, 8, 2, 2, BLACK), 64)
  assert.deepEqual([...pixels()], Array(64).fill(BLUE))
  upload([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 2, 2, 1, 0, 0])
  assert.equal(renderer.fifa98_render_mesh(3, 1, 8, 8, 0, 0, BLACK), 0)
})

test('semi-transparent colours use straight RGBA over opaque and transparent backgrounds', () => {
  upload(triangle(), [0, 1, 2], [0x800000ff])
  renderer.fifa98_render_mesh(3, 1, 8, 8, 0, 0, BLUE)
  assert.equal(pixels()[0], 0xff7f0080)
  renderer.fifa98_render_mesh(3, 1, 8, 8, 0, 0, 0)
  assert.equal(pixels()[0], 0x800000ff)
})

test('invalid mesh data fails before changing output; rendering has a bounded work budget', () => {
  renderer.fifa98_mesh_begin(8, 8, GREEN)
  const unchanged = () => assert.deepEqual([...pixels()], Array(64).fill(GREEN))
  upload(triangle(), [0, 1, 9])
  assert.equal(renderer.fifa98_mesh_draw(3, 1, 0, 0), -4); unchanged()
  upload(triangle())
  const memory = new Float32Array(renderer.memory.buffer, renderer.fifa98_mesh_vertices(), 15)
  for (const value of [NaN, Infinity, -Infinity, 1000001]) {
    memory[0] = value
    assert.equal(renderer.fifa98_mesh_draw(3, 1, 0, 0), -3); unchanged()
  }
  upload(triangle(0))
  assert.equal(renderer.fifa98_mesh_draw(3, 1, 0, 0), -3); unchanged()
  assert.equal(renderer.fifa98_mesh_draw(renderer.fifa98_mesh_vertex_capacity() + 1, 0, 0, 0), -2); unchanged()
  assert.equal(renderer.fifa98_mesh_draw(0, 0, 1025, 1), -2); unchanged()
  assert.equal(renderer.fifa98_mesh_begin(513, 8, BLACK), -1); unchanged()
  upload([0, 0, 1, 0, 0, 512, 0, 1, 1, 0, 0, 512, 1, 0, 1], Array(300).fill([0, 1, 2]).flat(), Array(300).fill(RED))
  assert.equal(renderer.fifa98_render_mesh(3, 300, 512, 512, 0, 0, BLACK), -5); unchanged()
})

test('platform renderer exposes bounded buffers and no external runtime imports', () => {
  assert.deepEqual(WebAssembly.Module.imports(module), [])
  assert.equal(renderer.fifa98_mesh_vertex_capacity(), 16384)
  assert.equal(renderer.fifa98_mesh_triangle_capacity(), 32768)
  assert.equal(renderer.fifa98_mesh_texture_capacity(), 1024 * 1024)
})
