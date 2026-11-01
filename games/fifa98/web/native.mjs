/** Browser adapter for bounded native texture conversion. */
export async function loadNative(bytes) {
  const module = await WebAssembly.compile(bytes)
  if (WebAssembly.Module.imports(module).length) throw new Error('Unexpected native core runtime imports')
  const { exports: core } = await WebAssembly.instantiate(module)
  for (const name of ['fifa98_pixels', 'fifa98_palette', 'fifa98_rgba', 'fifa98_capacity', 'fifa98_decode_indexed', 'fifa98_attribute_display', 'fifa98_signed_reciprocal']) {
    if (typeof core[name] !== 'function') throw new Error(`Missing native export: ${name}`)
  }
  if (!(core.memory instanceof WebAssembly.Memory)) throw new Error('Missing native memory')
  return {
    core,
    decodeMotionDeltas(previous, packed, widths) {
      if (typeof core.fifa98_mop_decode_deltas !== 'function') throw new Error('Native motion decoder is missing; rebuild the native module')
      if (!Array.isArray(previous) || !Array.isArray(widths) || previous.length !== widths.length ||
          previous.length > core.fifa98_mop_channel_capacity() || !(packed instanceof Uint8Array) ||
          Array.from(previous).some((value) => !Number.isInteger(value) || value < -32768 || value > 32767) ||
          Array.from(widths).some((value) => !Number.isInteger(value) || value < 0 || value > 16)) throw new Error('Invalid motion delta inputs')
      const bytes = Math.ceil(widths.reduce((sum, width) => sum + width, 0) / 16) * 2
      if (packed.length < bytes || bytes > core.fifa98_mop_packed_capacity()) throw new Error('Motion delta packet is truncated')
      new Int32Array(core.memory.buffer, core.fifa98_mop_previous(), previous.length).set(previous)
      new Uint32Array(core.memory.buffer, core.fifa98_mop_widths(), widths.length).set(widths)
      new Uint8Array(core.memory.buffer, core.fifa98_mop_packed(), bytes).set(packed.subarray(0, bytes))
      if (core.fifa98_mop_decode_deltas(previous.length, bytes) !== previous.length) throw new Error('Native motion delta decoding failed')
      return Array.from(new Int32Array(core.memory.buffer, core.fifa98_mop_decoded(), previous.length))
    },
    render(texture, palette = texture.palette) {
      const { width, height, indices } = texture
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
          width > 1024 || height > 1024 || width * height > core.fifa98_capacity()) throw new Error('Texture dimensions exceed the native renderer limit')
      if (!(indices instanceof Uint8Array) || indices.length !== width * height ||
          !(palette instanceof Uint16Array) || palette.length < 1 || palette.length > 256) throw new Error('Expected decoded indexed pixels and a 16-bit palette')
      const memory = new Uint8Array(core.memory.buffer)
      memory.set(indices, core.fifa98_pixels())
      const colours = new DataView(core.memory.buffer, core.fifa98_palette(), 512)
      for (let index = 0; index < palette.length; index++) colours.setUint16(index * 2, palette[index], true)
      // Parser indices are expanded to one byte per pixel, including 4bpp data.
      const result = core.fifa98_decode_indexed(width, height, 8, palette.length)
      if (result !== width * height) throw new Error(`Native indexed texture conversion failed (${result})`)
      return new Uint8ClampedArray(memory.slice(core.fifa98_rgba(), core.fifa98_rgba() + result * 4).buffer)
    },
    renderScene(batches, textures, width = 512, height = 384) {
      if (typeof core.fifa98_mesh_begin !== 'function' || typeof core.fifa98_mesh_draw !== 'function') throw new Error('Native geometry renderer is missing; rebuild the native module')
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) throw new Error('Invalid native scene dimensions')
      if (core.fifa98_mesh_begin(width, height, 0xff20140c) < 0) throw new Error('Could not initialize native geometry frame')
      const memory = new Uint8Array(core.memory.buffer)
      const vertexCapacity = core.fifa98_mesh_vertex_capacity(), triangleCapacity = core.fifa98_mesh_triangle_capacity()
      const vertices = new Float32Array(core.memory.buffer, core.fifa98_mesh_vertices(), vertexCapacity * 5)
      const indices = new Uint32Array(core.memory.buffer, core.fifa98_mesh_indices(), triangleCapacity * 3)
      const colours = new Uint32Array(core.memory.buffer, core.fifa98_mesh_colours(), triangleCapacity)
      const chunkSize = Math.min(Math.floor(vertexCapacity / 3), triangleCapacity)
      let triangles = 0
      for (const batch of batches) {
        const texture = batch.textureTag ? textures.get(batch.textureTag) : null
        if (batch.textureTag && !texture) throw new Error(`Missing original material texture: ${batch.textureTag}`)
        if (texture) {
          if (texture.width * texture.height > core.fifa98_mesh_texture_capacity() || texture.rgba.length !== texture.width * texture.height * 4) throw new Error('Scene texture exceeds native buffer')
          memory.set(texture.rgba, core.fifa98_mesh_texture())
        }
        for (let start = 0; start < batch.triangles.length; start += chunkSize) {
          const count = Math.min(chunkSize, batch.triangles.length - start)
          let offset = 0
          for (let index = 0; index < count; index++) for (const vertex of batch.triangles[start + index]) {
            if (vertex.length !== 5 || !vertex.every(Number.isFinite)) throw new Error('Invalid projected scene vertex')
            vertices.set(vertex, offset); offset += 5
          }
          for (let index = 0; index < count * 3; index++) indices[index] = index
          colours.fill(batch.colour, 0, count)
          const result = core.fifa98_mesh_draw(count * 3, count, texture?.width ?? 0, texture?.height ?? 0)
          if (result < 0) throw new Error(`Native geometry drawing failed (${result})`)
          triangles += count
        }
      }
      return { rgba: new Uint8ClampedArray(memory.slice(core.fifa98_mesh_rgba(), core.fifa98_mesh_rgba() + width * height * 4).buffer), triangles }
    },
  }
}
