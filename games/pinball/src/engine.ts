import type { ResourceFile } from './resources'

interface EngineFileSystem {
  mkdirTree(path: string): void
  writeFile(path: string, data: Uint8Array): void
  chdir(path: string): void
}

export interface PinballEngine {
  FS: EngineFileSystem
  callMain(args: string[]): number
  _pinball_input(action: number, pressed: number): void
  _pinball_new_game(): void
  _pinball_pause(paused: number): void
  _pinball_sound(enabled: number): void
}

export interface EngineCallbacks {
  onReady(): void
  onRunStart(): void
  onGameOver(score: number, eligible: boolean): void
  onPause(paused: boolean): void
  onError(message: string): void
}

export async function loadEngine(
  canvas: HTMLCanvasElement,
  resources: ResourceFile[],
  callbacks: EngineCallbacks,
): Promise<PinballEngine> {
  const base = new URL('./engine/', document.baseURI)
  const url = new URL('space-cadet.js', base).href
  const { default: createModule } = await import(/* @vite-ignore */ url)
  const engine: PinballEngine = await createModule({
    canvas,
    noInitialRun: true,
    locateFile: (file: string) => new URL(file, base).href,
    print: (message: string) => console.info(`[Space Cadet] ${message}`),
    printErr: (message: string) => console.warn(`[Space Cadet] ${message}`),
    onAbort: () => callbacks.onError('The game engine stopped. Reload the page to try again.'),
    onExit: (code: number) => {
      if (code !== 0)
        callbacks.onError(
          'The engine could not load these game resources. Reload and choose the complete resource folder.',
        )
    },
    onPinballReady: callbacks.onReady,
    onPinballRunStart: callbacks.onRunStart,
    onPinballGameOver: (score: number, eligible: number) =>
      callbacks.onGameOver(score, Boolean(eligible)),
    onPinballPause: (paused: number) => callbacks.onPause(Boolean(paused)),
  })
  engine.FS.mkdirTree('/game')
  for (const resource of resources) {
    const filename = `/game/${resource.path}`
    engine.FS.mkdirTree(filename.slice(0, filename.lastIndexOf('/')))
    engine.FS.writeFile(filename, resource.data)
  }
  engine.FS.chdir('/game')
  return engine
}
