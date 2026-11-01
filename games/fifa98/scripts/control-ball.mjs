/** Isolated launch/trajectory adapter around recovered native helpers. A new
 * free launch places a test ball at the player; owned-ball tests supply the
 * original attachment preconditions explicitly. This is not possession acquisition, a kick
 * animation callback or collision detection. Original launch parameter10 and
 * other fixture settings are explicit configuration, not named player stats.
 */
const words = (value, length, maximum = 0xffffffff) => Array.isArray(value) && value.length === length &&
  Array.from(value).every((word) => Number.isInteger(word) && word >= 0 && word <= maximum)
export function createControlBall(core, config, { sine, atan, bounds }) {
  const names = ['control_workspace', 'control_workspace_words', 'ball_ground_launch', 'ball_motion_tick',
    'random_seed', 'control_target','control_heading', 'ball_flight_tables', 'ball_loft_random_launch',
    'ball_visual_speed', 'ball_visual_phase','player_ball_marker','player_ball_attach','player_ball_follow']
  if (!(core?.memory instanceof WebAssembly.Memory) || names.some((name) => typeof core[`fifa98_${name}`] !== 'function')) throw new Error('Native ball module is incomplete')
  if (!words(sine,257) || !words(atan,257,255) || !words(bounds,3,32767) ||
      !words(config?.atan16,257) || !words(config?.exponential,113) || !words(config?.material,3) ||
      !Number.isInteger(config.parameter) || config.parameter < 1 || config.parameter > 3167 ||
      !Number.isInteger(config.flight?.duration) || config.flight.duration < 1 || config.flight.duration > 319 ||
      ![config.gravity,config.options,config.seed].every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffffffff)) throw new Error('Invalid original ball test configuration')
  if (core.fifa98_control_workspace_words() < 1472) throw new Error('Native ball transfer workspace is too small')
  // Reserve a separate portion beyond the control session's first512 words.
  const base = core.fifa98_control_workspace() + 512 * 4
  const memory = new Uint32Array(core.memory.buffer,base,960)
  const ptr = (offset) => base + offset * 4
  const put = (offset, values) => memory.set(values,offset)
  const get = (offset,length) => Array.from(memory.slice(offset,offset+length))
  let state, spin, random, active, stopReason, ticks, launch,visualHeading,visualPhase,owned,attachment
  function headingFor(velocity,previous){
    if(!velocity[0] && !velocity[2])return previous
    const heading=core.fifa98_control_heading(velocity[0],velocity[2],ptr(0))
    if(heading===-2147483648)throw new Error('Native ball visual heading rejected its input')
    return heading&1023
  }
  function configure() {
    new Uint8Array(core.memory.buffer,base,257).set(atan)
    put(72,config.atan16); put(336,sine); put(600,config.exponential)
    put(736,config.material); put(772,bounds)
  }
  function reset() {
    configure()
    if (core.fifa98_random_seed(config.seed,ptr(744)) !== 1) throw new Error('Native ball seed rejected')
    random = get(744,6); state = null; spin = 0; active = false; stopReason = null; ticks = 0; launch = null;visualHeading=0;visualPhase=[0,0]
    owned=false;attachment=null
  }
  function snapshot() {
    return { exists: state !== null, active, owned,stopReason, ticks, spin: spin | 0,visualHeading,visualPhase:visualPhase[1],
      fixedPosition: state ? state.slice(0,3).map((word) => word | 0) : null,
      position: state ? state.slice(0,3).map((word) => (word | 0) / 65536) : null,
      velocity: state ? state.slice(3,6).map((word) => word | 0) : null,
      sourceLaunch: launch ? { ...launch, target: [...launch.target] } : null }
  }
  function checkPlayer(player){
    if (!Array.isArray(player?.fixedPosition) || player.fixedPosition.length !== 2 ||
        !player.fixedPosition.every((value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) ||
        !Array.isArray(player.target) || player.target.length !== 3 || !player.target.every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) ||
        !Number.isInteger(player.facing)) throw new Error('Invalid player position for ball test')
  }
  function carryFrom(player){
    checkPlayer(player)
    // Explicit owned-ball test setup. This does not acquire a moving ball or
    // infer contact: it starts a new ball at the controlled player's position.
    const position=[player.fixedPosition[0]>>>0,0,player.fixedPosition[1]>>>0]
    const integer=position.map((word)=>word>>16)
    state=[...position,0,0,0,...position];attachment=[...integer,...integer,...integer,0]
    owned=true;spin=0;active=true;stopReason=null;ticks=0;launch=null;visualPhase=[0,0];visualHeading=0
    return snapshot()
  }
  function launchFrom(player, {kind='ground'}={}) {
    if(!['ground','loft','curve','reverse-curve'].includes(kind))throw new Error('Unknown original ball launch test')
    checkPlayer(player)
    configure()
    const position = owned ? state.slice(0,3) : [player.fixedPosition[0] >>> 0,0,player.fixedPosition[1] >>> 0]
    const integerPosition = [player.fixedPosition[0] >> 16,0,player.fixedPosition[1] >> 16]
    put(752,position)
    let target = [...player.target]
    // At rest the controller target can equal the player. Select the original
    // analog direction-to-target branch using current facing as an explicit
    // inspection input, rather than inventing a launch vector or power curve.
    if (target[0] === integerPosition[0] && target[2] === integerPosition[2]) {
      put(760,[0,0]); put(764,[1,1,player.facing,0,0,1,0]); put(776,integerPosition)
      if (core.fifa98_control_target(ptr(760),ptr(764),ptr(776),ptr(772),ptr(336),ptr(756)) !== 1) throw new Error('Native ball target rejected')
      target = get(756,3).map((word) => word | 0)
    } else put(756,target)
    let result,output,nextSpin=0,nextRandom=random
    if(kind==='ground'){
      result = core.fifa98_ball_ground_launch(ptr(752),ptr(756),config.parameter,ptr(0),ptr(72),ptr(336),ptr(600),ptr(780))
      output=get(780,6)
    }else{
      // Wrapper757E4 accepts a fixed target. Duration is an explicit fixture;
      // the original action/duration producer has not been recovered.
      if(core.fifa98_ball_flight_tables(ptr(0),ptr(72),ptr(336))!==1)throw new Error('Original airborne launch tables rejected')
      put(756,target.map((value)=>value<<16));put(744,random)
      const mode=kind==='loft'?2:kind==='curve'?0:1
      result=core.fifa98_ball_loft_random_launch(ptr(752),ptr(756),config.flight.duration,mode,ptr(744),ptr(0),ptr(72),ptr(336),ptr(600),ptr(780))
      output=get(780,8);nextSpin=output[6];nextRandom=get(744,6)
    }
    if (result !== 0 && result !== 1) throw new Error('Original ball launch rejected its input')
    const nextHeading=headingFor(output.slice(0,3),visualHeading)
    state = [...position,...output.slice(0,3),...position]; spin = nextSpin;random=nextRandom;ticks = 0;visualPhase=[0,0]
    owned=false;attachment=null
    visualHeading=nextHeading
    active = output.slice(0,3).some((word) => word !== 0); stopReason = active ? null : 'rest'
    launch = { kind,target, parameter:kind==='ground'?config.parameter:null,duration:kind==='ground'?null:config.flight.duration,
      speed: output[3], distance: output[4], heading: output[5], fallback: result === 1 }
    return snapshot()
  }
  function step(count = 1, {player,marker}={}) {
    if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error('Ball test requires1–6 source ticks')
    if (!active) return snapshot()
    configure(); put(720,state); memory[732] = spin; put(744,random)
    let nextReason = null, advanced = 0,displacement=[0,0,0]
    let nextAttachment=attachment
    if(owned){
      checkPlayer(player)
      if(![marker?.prefixA,marker?.prefixB].every((prefix)=>Array.isArray(prefix)&&prefix.length===9&&prefix.every((value)=>Number.isInteger(value)&&value>=-32768&&value<=32767)) ||
          !Number.isInteger(marker.fraction16)||marker.fraction16<0||marker.fraction16>65535||typeof marker.mirror!=='boolean'||
          !Number.isInteger(marker.headingRaw)||marker.headingRaw< -2147483648||marker.headingRaw>4294967295)throw new Error('Invalid original ball attachment marker')
      put(800,marker.prefixA);put(812,marker.prefixB);put(824,player.fixedPosition);put(832,[1,1,1]);put(840,attachment)
      if(core.fifa98_player_ball_marker(ptr(800),ptr(812),marker.fraction16,ptr(824),marker.headingRaw,Number(marker.mirror),ptr(336),ptr(828))!==1 ||
          core.fifa98_player_ball_attach(ptr(828),ptr(832),0x1000,ptr(840))!==1 ||
          core.fifa98_player_ball_follow(ptr(840),count,0,ptr(720))!==1)throw new Error('Original owned-ball branch requires an unrecovered contact or animation state')
      const position=get(720,3).map((word)=>word|0)
      if(Math.abs(position[0])>bounds[0]*65536||Math.abs(position[2])>bounds[1]*65536){
        active=false;stopReason='boundary';return snapshot()
      }
      displacement=get(720,3).map((word,index)=>(word-memory[726+index])|0)
      advanced=count;nextAttachment=get(840,10)
    }else{
    for (let i = 0; i < count; i++) {
      const nextX = (memory[720] | 0) + (memory[723] | 0)
      const nextZ = (memory[722] | 0) + (memory[725] | 0)
      // This is a stop-before-unrecovered-contact guard, not a wall bounce or
      // an original touchline law. Never clamp/reposition the moving ball.
      if (Math.abs(nextX) > bounds[0] * 65536 || Math.abs(nextZ) > bounds[1] * 65536) { nextReason = 'boundary'; break }
      const before=get(720,3)
      const result = core.fifa98_ball_motion_tick(ptr(720),ptr(732),config.gravity,ptr(736),config.options,ptr(744))
      if (result !== 1 && result !== 2) throw new Error('Original isolated ball step rejected its input')
      displacement=get(720,3).map((word,index)=>(word-before[index])|0)
      advanced++
      if (!memory[721] && !memory[723] && !memory[724] && !memory[725]) { nextReason = 'rest'; break }
    }
    }
    put(790,visualPhase)
    const nextHeading=headingFor(displacement,visualHeading)
    const speed=core.fifa98_ball_visual_speed(displacement[0],displacement[2])>>>0
    if(core.fifa98_ball_visual_phase(ptr(790),speed,advanced,0,0,0)!==1)throw new Error('Original ball visual phase rejected its input')
    // Transfer buffers are staging storage. A failed multi-tick call above
    // cannot partially commit public position, spin, seed or tick count.
    state = get(720,9); spin = memory[732]; random = get(744,6); ticks += advanced;visualHeading=nextHeading
    attachment=nextAttachment;visualPhase=get(790,2);stopReason = nextReason; active = !nextReason
    return snapshot()
  }
  reset()
  return { reset,carryFrom, launchFrom, step, snapshot }
}
