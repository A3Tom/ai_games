# Vendored source

Source: https://github.com/k4zmu2a/SpaceCadetPinball

Copied from the workspace checkout at commit
`cb9b7b886244a27773f66b0b19fdc2998392565e` ("add brew commands (#218)").
The original source license is in `LICENSE`; its original documentation is in `README.md`.
Original game data is not included.

Local changes in `SpaceCadetPinball/winmain.cpp`, `winmain.h`, and `pb.cpp` add guarded
Emscripten browser scheduling and lifecycle callbacks. The browser build hides native
menus and defers keyboard, touch, pause, audio, fullscreen, and leaderboard controls to
the host page. It disables native restart/exit flows and file-based ImGui preferences.
The browser build and exported controls live separately in `../../engine/`.
Native code paths remain available.

The browser loop uses fixed 360 Hz simulation updates and display-synchronized
rendering, composing the table once after each batch of physics updates.

`THIRD_PARTY_NOTICES.txt` preserves the notices for vendored ImGui, SDL runtime libraries,
the embedded font, and the Emscripten toolchain runtime used by the browser build.
