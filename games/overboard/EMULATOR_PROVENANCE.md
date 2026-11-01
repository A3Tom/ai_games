# Emulator runtime provenance

Overboard! uses the unmodified EmulatorJS **4.2.3** frontend and its **PCSX ReARMed 2.0.2** WebAssembly core. The frontend is GPL-3.0-or-later; the core is GPLv2. EmulatorJS also incorporates RetroArch and third-party components whose notices remain in the supplied runtime and core archive.

- Frontend source and release: <https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3>
- Core source: <https://github.com/EmulatorJS/pcsx_rearmed>
- Core build scripts: <https://github.com/EmulatorJS/build>
- Pinned upstream distribution: <https://cdn.emulatorjs.org/4.2.3/data/>
- Core build report: <https://cdn.emulatorjs.org/4.2.3/data/cores/reports/pcsx_rearmed.json>

The checksums and byte lengths in `emulator-lock.json` were calculated from these upstream files. `scripts/fetch-emulator.mjs` verifies every cached or downloaded file against the lock before the build uses it. Generated runtime files stay outside Git under `public/emulator/`, and Vite copies them into the served build. The script repairs missing or damaged files and reuses an entirely verified bundle without network access.

The `.data` core files are 7-Zip archives containing JavaScript, WebAssembly, `core.json`, `build.json`, and `license.txt`. The build metadata identifies core version 2.0.2 and minimum EmulatorJS version 4.2.2; the accompanying report dates the build to 14 June 2025. This distribution does not record the underlying core source commit, so the upstream source links should not be presented as a reproducible source-to-binary attestation.

Both WebGL 1 and WebGL 2 variants are retained, including the optional threaded variants, so supported settings never require a CDN core fallback. The first iteration uses the single-threaded core and requires no cross-origin isolation headers. Enabling threads requires SharedArrayBuffer and appropriate hosting headers. ZIP and 7-Zip decoders are included for game and core extraction. The original runtime includes an optional update check when served on localhost; ordinary play uses the bundled files.

`public/emulator/LICENSE.txt` preserves the frontend's full license. The emulator's About menu exposes its notices and the core's embedded license. Keep these files and source links available when serving or redistributing the runtime.

No Sony BIOS, game disc, or commercial artwork is downloaded by this script. Game data is prepared separately from the user's supplied local files. The pinned PCSX ReARMed build supports BIN/CUE and compressed archives containing them; it does not advertise CHD support.
