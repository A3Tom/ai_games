#include "pch.h"
#include <emscripten.h>
#include "browser.h"
#include "winmain.h"
#include "pb.h"
#include "options.h"
#include "TPinballTable.h"
#include "nudge.h"

namespace
{
bool ready = false;
bool held[4]{};

void release_inputs()
{
  if (!pb::MainTable)
    return;
  pb::MainTable->Message(MessageCode::LeftFlipperInputReleased, pb::time_now);
  pb::MainTable->Message(MessageCode::RightFlipperInputReleased, pb::time_now);
  pb::MainTable->Message(MessageCode::PlungerInputReleased, pb::time_now);
  nudge::un_nudge_up(0, nullptr);
  std::fill(std::begin(held), std::end(held), false);
}
}

void pinball_browser_ready()
{
  ready = true;
  EM_ASM({ if (Module.onPinballReady) Module.onPinballReady(); });
}

void pinball_browser_run_start()
{
  std::fill(std::begin(held), std::end(held), false);
  EM_ASM({ if (Module.onPinballRunStart) Module.onPinballRunStart(); });
}

void pinball_browser_game_over(int score, bool eligible)
{
  release_inputs();
  EM_ASM({
    if (Module.onPinballGameOver) Module.onPinballGameOver($0, !!$1);
  }, score, eligible);
}

void pinball_browser_pause(bool paused)
{
  EM_ASM({ if (Module.onPinballPause) Module.onPinballPause(!!$0); }, paused);
}

extern "C"
{
EMSCRIPTEN_KEEPALIVE void pinball_input(int action, int pressed)
{
  if (!ready || !pb::MainTable || action < 0 || action > 3)
    return;
  const bool down = pressed != 0;
  if (held[action] == down)
    return;
  held[action] = down;
  if (winmain::single_step || pb::game_mode != GameModes::InGame)
    return;

  switch (action)
  {
  case 0:
    pb::MainTable->Message(down ? MessageCode::LeftFlipperInputPressed : MessageCode::LeftFlipperInputReleased,
      pb::time_now);
    break;
  case 1:
    pb::MainTable->Message(down ? MessageCode::RightFlipperInputPressed : MessageCode::RightFlipperInputReleased,
      pb::time_now);
    break;
  case 2:
    pb::MainTable->Message(down ? MessageCode::PlungerInputPressed : MessageCode::PlungerInputReleased,
      pb::time_now);
    break;
  case 3:
    if (down && !pb::MainTable->TiltLockFlag)
      nudge::nudge_up();
    else if (!down)
      nudge::un_nudge_up(0, nullptr);
    break;
  }
}

EMSCRIPTEN_KEEPALIVE void pinball_new_game()
{
  if (!ready)
    return;
  release_inputs();
  options::Options.Players = 1;
  winmain::new_game();
}

EMSCRIPTEN_KEEPALIVE void pinball_pause(int paused)
{
  if (!ready || winmain::single_step == (paused != 0))
    return;
  release_inputs();
  winmain::pause();
}

EMSCRIPTEN_KEEPALIVE void pinball_sound(int enabled)
{
  if (!ready)
    return;
  if (static_cast<bool>(options::Options.Sounds) != (enabled != 0))
    options::toggle(Menu1::Sounds);
  // Original MIDI files need a synthesizer; this port exposes sound effects only.
}
}

int main(int, char**)
{
  // Keep SDL keyboard capture inside the game so surrounding form controls retain
  // their normal Space/Enter activation and typing behavior.
  SDL_SetHint(SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT, "canvas");
  return winmain::WinMain("");
}
