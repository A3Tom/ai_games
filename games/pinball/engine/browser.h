#pragma once

// These hooks belong to the browser adapter; the vendored native build is unchanged.
void pinball_browser_ready();
void pinball_browser_run_start();
void pinball_browser_game_over(int score, bool eligible);
void pinball_browser_pause(bool paused);
