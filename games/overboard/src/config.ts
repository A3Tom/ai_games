export interface Disc {
  url: string
  name: string
  size: number
  biosUrl?: string
}

export interface MediaManifest {
  version: 1
  title: string
  file: string
  size: number
  tracks: number
  bios?: string
}

const plainFilename = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function readManifest(value: unknown): MediaManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid game media manifest.')
  const data = value as Record<string, unknown>
  if (data.version !== 1 || typeof data.title !== 'string' ||
    typeof data.file !== 'string' || !plainFilename.test(data.file) || !data.file.endsWith('.zip') ||
    typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size <= 0 ||
    typeof data.tracks !== 'number' || !Number.isInteger(data.tracks) || data.tracks < 1 ||
    (data.bios !== undefined && (typeof data.bios !== 'string' || !plainFilename.test(data.bios)))) {
    throw new Error('Invalid game media manifest. Import the disc again.')
  }
  return data as unknown as MediaManifest
}

export function validateLocalDisc(file: Pick<File, 'name' | 'size'>): void {
  if (!file.name.toLowerCase().endsWith('.zip') || file.size === 0) {
    throw new Error('Choose a ZIP containing the .cue sheet and every .bin track. A single BIN omits the music.')
  }
}

export function validateBios(file: Pick<File, 'size'>): void {
  if (file.size !== 512 * 1024) throw new Error('A PlayStation BIOS must be a 512 KB binary dump.')
}

export function controllerStatus(gamepads: readonly (Pick<Gamepad, 'connected' | 'id'> | null)[]): string {
  const connected = gamepads.filter((pad) => pad?.connected)
  if (!connected.length) return 'Keyboard ready · press a button on your controller to connect'
  return `${connected.length === 1 ? 'Controller connected' : `${connected.length} controllers connected`} · ${connected[0]!.id}`
}

export function buildEmulatorConfig(disc: Disc, baseUrl: string): Record<string, unknown> {
  return {
    EJS_player: '#game',
    EJS_core: 'pcsx_rearmed',
    EJS_pathtodata: new URL('emulator/', baseUrl).href,
    EJS_gameUrl: disc.url,
    EJS_gameName: 'Overboard! (Europe)',
    // Blob URLs have no BIOS filename. Load an explicit filename into the
    // core's system directory so a locally selected BIOS is actually found.
    EJS_biosUrl: '',
    EJS_externalFiles: disc.biosUrl ? { '/scph5502.bin': disc.biosUrl } : {},
    EJS_startOnLoaded: true,
    EJS_language: 'en-US',
    EJS_disableAutoLang: false,
    EJS_color: '#d9b77c',
    EJS_backgroundColor: '#050909',
    EJS_controlScheme: 'psx',
    EJS_threads: false,
    EJS_CacheLimit: 0,
    EJS_disableDatabases: true,
    EJS_Buttons: { exitEmulation: false },
    EJS_defaultOptions: {
      'save-save-interval': '30',
      'save-state-location': 'browser',
    },
    EJS_defaultControls: {
      0: {
        0: { value: 'x', value2: 'BUTTON_1' },
        1: { value: 'z', value2: 'BUTTON_3' },
        2: { value: 'shift', value2: 'SELECT' },
        3: { value: 'enter', value2: 'START' },
        4: { value: 'up arrow', value2: 'DPAD_UP' },
        5: { value: 'down arrow', value2: 'DPAD_DOWN' },
        6: { value: 'left arrow', value2: 'DPAD_LEFT' },
        7: { value: 'right arrow', value2: 'DPAD_RIGHT' },
        8: { value: 'c', value2: 'BUTTON_2' },
        9: { value: 's', value2: 'BUTTON_4' },
        10: { value: 'q', value2: 'LEFT_TOP_SHOULDER' },
        11: { value: 'e', value2: 'RIGHT_TOP_SHOULDER' },
        12: { value: 'a', value2: 'LEFT_BOTTOM_SHOULDER' },
        13: { value: 'd', value2: 'RIGHT_BOTTOM_SHOULDER' },
        14: {}, 15: {}, 16: {}, 17: {}, 18: {}, 19: {}, 20: {}, 21: {}, 22: {}, 23: {},
        24: {}, 25: {}, 26: {}, 27: {}, 28: {}, 29: {},
      },
      1: {}, 2: {}, 3: {},
    },
  }
}
