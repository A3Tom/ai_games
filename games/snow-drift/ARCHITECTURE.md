# Bam in a Carpark - Architecture Diagram

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                          index.html                              │
│  - Main HTML file                                                │
│  - UI elements (speedometer, instructions)                       │
│  - Imports and initializes Game class                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ imports
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                          game.js                                 │
│  Game Class - Main Orchestrator                                  │
│  - Initializes Three.js (scene, camera, renderer)               │
│  - Coordinates all game systems                                  │
│  - Runs game loop (update/render)                               │
│  - Manages camera following                                      │
└────┬────────┬────────┬────────┬────────┬─────────────────────────┘
     │        │        │        │        │
     │        │        │        │        │ imports
     ▼        ▼        ▼        ▼        ▼
┌─────────┐ ┌──────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐
│config.js│ │car.js│ │environment.js│ │particles.js│ │ input.js  │
└─────────┘ └──────┘ └──────────────┘ └──────────┘ └────────────┘
     ▲        ▲            ▲               ▲              ▲
     │        │            │               │              │
     └────────┴────────────┴───────────────┴──────────────┘
              All modules import config.js


## Class Responsibilities

┌────────────────────────────────────────────────────────────────┐
│ CONFIG (config.js)                                             │
├────────────────────────────────────────────────────────────────┤
│ • World settings (ground size, tree count)                     │
│ • Physics parameters (speed, drift, friction)                  │
│ • Visual settings (colors, fog, camera)                        │
│ • Particle settings                                            │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ InputManager (input.js)                                        │
├────────────────────────────────────────────────────────────────┤
│ • Listens to keyboard events                                   │
│ • Maintains input state                                        │
│ • Provides: getInputs(), isAccelerating(), isBoosting(), etc.  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Car (car.js)                                                   │
├────────────────────────────────────────────────────────────────┤
│ • Builds 3D car model (chassis, wheels, lights)                │
│ • Physics simulation (acceleration, steering, drift)           │
│ • Boundary enforcement                                         │
│ • Provides: getPosition(), getAngle(), getSpeed(), update()    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Environment (environment.js)                                   │
├────────────────────────────────────────────────────────────────┤
│ • Sets up lighting (ambient + directional)                     │
│ • Creates ground plane with grid                               │
│ • Generates trees procedurally                                 │
│ • All objects added to scene                                   │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ SnowParticles (particles.js)                                   │
├────────────────────────────────────────────────────────────────┤
│ • Creates falling snow particle system                         │
│ • Animates snow falling                                        │
│ • Follows player position (infinite effect)                    │
│ • Provides: update(carPosition)                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ TrailParticles (particles.js)                                  │
├────────────────────────────────────────────────────────────────┤
│ • Creates snow spray particle system                           │
│ • Spawns particles from rear wheels                            │
│ • Manages particle lifecycle                                   │
│ • Provides: update(carState)                                   │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Game (game.js)                                                 │
├────────────────────────────────────────────────────────────────┤
│ • Initializes Three.js components                              │
│ • Creates instances of all game systems                        │
│ • Game loop: update() → render()                               │
│ • Camera following with lerp smoothing                         │
│ • Speedometer UI update                                        │
└────────────────────────────────────────────────────────────────┘


## Game Loop Flow

    ┌──────────────┐
    │ Game._init() │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────┐
    │ Setup scene, camera, │
    │ renderer             │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Create game systems: │
    │ - InputManager       │
    │ - Environment        │
    │ - Car                │
    │ - SnowParticles      │
    │ - TrailParticles     │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────┐
    │ Start game loop  │
    │ _animate()       │
    └──────┬───────────┘
           │
           ▼
    ┌─────────────────────────────────────┐
    │         Game Loop (60 FPS)          │
    │                                     │
    │  1. Get inputs from InputManager    │
    │  2. Car.update(inputs) - physics    │
    │  3. Update camera position          │
    │  4. SnowParticles.update()          │
    │  5. TrailParticles.update()         │
    │  6. Update speedometer UI           │
    │  7. Render scene                    │
    │                                     │
    │  requestAnimationFrame → repeat     │
    └─────────────────────────────────────┘


## Before vs After Refactoring

### Before (Single File - 529 lines)
- All code in one HTML file
- Global variables everywhere
- Hard to test individual components
- Difficult to locate specific functionality
- No clear separation of concerns

### After (Modular Structure)
- config.js: 63 lines (settings)
- input.js: 93 lines (input handling)
- car.js: 219 lines (car model & physics)
- environment.js: 104 lines (world building)
- particles.js: 146 lines (visual effects)
- game.js: 150 lines (orchestration)
- index.html: 68 lines (minimal entry point)
- README.md: Documentation

**Benefits:**
✓ Each file has single responsibility
✓ Easy to locate and modify code
✓ Reusable components
✓ Better for team collaboration
✓ Easier to extend with new features
✓ Testable modules
