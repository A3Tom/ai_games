import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
export const nativeOutput = path.join(root, '.engine-build', 'fifa98-core.wasm')
export const nativeExports = Object.freeze([
  'fifa98_attribute_display', 'fifa98_signed_reciprocal', 'fifa98_pixels', 'fifa98_palette',
  'fifa98_rgba', 'fifa98_capacity', 'fifa98_decode_indexed',
  'fifa98_mesh_vertices', 'fifa98_mesh_indices', 'fifa98_mesh_colours', 'fifa98_mesh_texture',
  'fifa98_mesh_rgba', 'fifa98_mesh_vertex_capacity', 'fifa98_mesh_triangle_capacity',
  'fifa98_mesh_texture_capacity', 'fifa98_mesh_begin', 'fifa98_mesh_draw', 'fifa98_render_mesh',
  'fifa98_pcmd_position_component', 'fifa98_pcmd_uv_component',
  'fifa98_planar_distance', 'fifa98_distance_rows', 'fifa98_tick_accumulate',
  'fifa98_match_workspace', 'fifa98_match_workspace_words',
  'fifa98_fixed_multiply', 'fifa98_ball_air_drag', 'fifa98_ball_free_tick',
  'fifa98_pitch_vertices', 'fifa98_pitch_quads', 'fifa98_pitch_uv', 'fifa98_pitch_vertex_capacity',
  'fifa98_pitch_quad_capacity', 'fifa98_pitch_profile_extent', 'fifa98_pitch_generate',
  'fifa98_pcmd_quaternion', 'fifa98_pcmd_matrix', 'fifa98_pcmd_quaternion_matrix',
  'fifa98_ball_surface_material', 'fifa98_ball_ground_contact', 'fifa98_ball_ground_drag', 'fifa98_ball_surface_tick',
  'fifa98_mop_previous', 'fifa98_mop_decoded', 'fifa98_mop_widths', 'fifa98_mop_packed',
  'fifa98_mop_channel_capacity', 'fifa98_mop_packed_capacity', 'fifa98_mop_decode_deltas',
  'fifa98_pcmd_skin_joints', 'fifa98_pcmd_skin_rows', 'fifa98_pcmd_skin_vertices',
  'fifa98_pcmd_skin_matrices', 'fifa98_pcmd_skin', 'fifa98_pcmd_attachment',
  'fifa98_player_heading_vector', 'fifa98_player_digital_direction', 'fifa98_player_motion_profile',
  'fifa98_player_target_speed', 'fifa98_player_motion_integrate',
  'fifa98_control_heading', 'fifa98_control_decay', 'fifa98_control_pitch_bound',
  'fifa98_control_target', 'fifa98_control_target_delta', 'fifa98_control_workspace', 'fifa98_control_workspace_words',
  'fifa98_player_steer', 'fifa98_player_speed_clamp',
  'fifa98_locomotion_state', 'fifa98_locomotion_motion', 'fifa98_locomotion_categories', 'fifa98_locomotion_actions',
  'fifa98_locomotion_phase_state', 'fifa98_locomotion_select', 'fifa98_locomotion_phase', 'fifa98_locomotion_run_variant',
  'fifa98_player_render_position',
  'fifa98_random_seed', 'fifa98_random_next', 'fifa98_ball_air_motion', 'fifa98_ball_motion_tick',
  'fifa98_ball_visual_speed', 'fifa98_ball_visual_phase',
  'fifa98_ball_flight_tables','fifa98_ball_flight_factors','fifa98_ball_flight_angles',
  'fifa98_ball_loft_launch','fifa98_ball_loft_random_launch',
  'fifa98_player_ball_marker','fifa98_player_ball_attach','fifa98_player_ball_follow',
  'fifa98_ball_heading16', 'fifa98_ball_heading_vector16', 'fifa98_ball_ground_launch_speed', 'fifa98_ball_ground_launch',
  'fifa98_ball_action_target',
  'fifa98_action_runtime_flags', 'fifa98_action_pose', 'fifa98_action_workspace', 'fifa98_action_workspace_words',
])
export const nativeSources = Object.freeze(['core.c', 'renderer.c', 'model.c', 'match.c', 'pitch.c', 'motion.c', 'player.c', 'control-target.c', 'steering.c', 'locomotion-animation.c', 'player-placement.c', 'ball-motion.c', 'ball-interaction.c', 'action-transition.c','ball-flight.c','player-ball.c'])

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw new Error(`Cannot run ${command}: ${result.error.message}. Install Clang and wasm-ld or set FIFA98_CLANG/FIFA98_WASM_LD.`, { cause: result.error })
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

export async function buildNative() {
  const directory = path.dirname(nativeOutput)
  await mkdir(directory, { recursive: true })
  const objects = nativeSources.map((name) => path.join(directory, `${name}-${process.pid}.o`))
  const temporary = path.join(directory, `core-${process.pid}.wasm`)
  const compiler = process.env.FIFA98_CLANG || 'clang'
  const linker = process.env.FIFA98_WASM_LD || 'wasm-ld'
  const compilerVersion = run(compiler, ['--version']).split('\n')[0]
  const linkerVersion = run(linker, ['--version']).split('\n')[0]
  try {
    for (let index = 0; index < nativeSources.length; index++) {
      run(compiler, ['--target=wasm32', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
        '-ffreestanding', '-fno-builtin', '-nostdlib', '-c', path.join(root, 'native', nativeSources[index]), '-o', objects[index]])
    }
    run(linker, ['--no-entry', '--strip-all', '--export-memory', '--initial-memory=33554432',
      '--max-memory=33554432', ...nativeExports.map((name) => `--export=${name}`), ...objects, '-o', temporary])
    const bytes = await readFile(temporary)
    const module = await WebAssembly.compile(bytes)
    if (WebAssembly.Module.imports(module).length) throw new Error('The native core must not import a host runtime.')
    const exported = new Set(WebAssembly.Module.exports(module).map(({ name }) => name))
    if (['memory', ...nativeExports].some((name) => !exported.has(name))) throw new Error('Native core exports are incomplete.')
    const sources = await Promise.all(nativeSources.map(async (name) => ({ path: name,
      sha256: createHash('sha256').update(await readFile(path.join(root, 'native', name))).digest('hex') })))
    const manifest = {
      version: 1, status: 'reconstruction-only', compiler: compilerVersion, linker: linkerVersion,
      sourceSha256: sources[0].sha256, sources,
      wasmSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      exports: [...exported], imports: [],
    }
    await rename(temporary, nativeOutput)
    await writeFile(path.join(directory, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    return { output: nativeOutput, ...manifest }
  } finally {
    await Promise.all([...objects.map((object) => rm(object, { force: true })), rm(temporary, { force: true })])
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node games/fifa98/scripts/build-native.mjs')
    process.exitCode = 1
  } else {
    try { console.log(JSON.stringify(await buildNative(), null, 2)) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
  }
}
