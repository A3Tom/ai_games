import { fileURLToPath } from 'node:url'
import { prepareMedia } from './media.mjs'

const manifest = await prepareMedia({
  source: fileURLToPath(new URL('../../../reference-games/Overboard!', import.meta.url)),
  output: fileURLToPath(new URL('../public/game-data', import.meta.url)),
})
console.log(manifest
  ? `Overboard disc ready: ${manifest.tracks} tracks (${manifest.size} bytes).`
  : 'No bundled Overboard disc. Players can select their own disc ZIP on the game page.')
