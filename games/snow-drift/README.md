# Bam in a Carpark - Refactored

A 3D arcade-style drifting game built with Three.js, featuring snow physics and particle effects.

## Project Structure

```
games/snow-drift/
├── index.html              # Main HTML entry point
├── js/
│   ├── config.js          # Game configuration and constants
│   ├── game.js            # Main game orchestrator
│   ├── car.js             # Car model and physics
│   ├── environment.js     # World generation (ground, trees, lighting)
│   ├── input.js           # Keyboard input management
│   └── particles.js       # Snow and trail particle systems
└── README.md              # This file
```

## Architecture Overview

The game has been refactored into a modular, object-oriented structure:

### **config.js**
- Centralized configuration for all game constants
- Easy tweaking of physics, visuals, and gameplay parameters
- Single source of truth for game settings

### **input.js - InputManager**
- Handles all keyboard input
- Provides clean interface for querying input state
- Separates input handling from game logic

### **car.js - Car**
- Encapsulates car model creation
- Manages car physics (acceleration, steering, drift)
- Exposes public API for position, angle, speed, and velocity
- Handles boundary collisions

### **environment.js - Environment**
- Creates and manages the game world
- Sets up lighting (ambient + directional)
- Generates ground with grid overlay
- Procedurally places trees with variation

### **particles.js**
- **SnowParticles**: Falling snow that follows the player
- **TrailParticles**: Snow spray effects when drifting
- Efficient particle pooling and lifecycle management

### **game.js - Game**
- Main game orchestrator
- Initializes Three.js scene, camera, renderer
- Coordinates all game systems
- Manages game loop and updates
- Handles camera following behavior
- Updates UI elements (speedometer)

## Benefits of Refactoring

### Maintainability
- **Separation of Concerns**: Each module has a single, clear responsibility
- **Easy to Locate**: Bug fixes and features are isolated to specific files
- **Reduced Complexity**: Each file is shorter and easier to understand

### Extensibility
- **Easy to Add Features**: Want to add obstacles? Create an `obstacles.js` module
- **Reusable Components**: Car class could be extended for different vehicle types
- **Configuration-Driven**: Change game behavior by editing `config.js`

### Testability
- **Unit Testing**: Each class can be tested independently
- **Mock Dependencies**: Input/rendering can be mocked for physics testing
- **Isolated State**: Car physics isolated from rendering logic

### Code Quality
- **Clear API Boundaries**: Public methods clearly defined
- **Encapsulation**: Internal state is private, accessed via getters
- **Consistent Patterns**: All classes follow similar structure

## How to Run

From the repository root, run the collection with `docker compose -f docker-compose.local.yml up --build -d` and open <http://localhost:14650/snow_drift/>. The source directory is `games/snow-drift/`; its public route remains `/snow_drift/`. Three.js loads from its CDN.

Without Docker, [set up pnpm](../../README.md#local-development-and-checks), prepare the collection once with `node scripts/build-collection.mjs --install --build`, then run `STATIC_DIR="$PWD/deploy" pnpm run dev:server`. The install step covers all workspace dependencies, including the server. Rerun `pnpm run package:collection` after editing Snow Drift. Serving the staged collection keeps its relative imports and dashboard links correct. Other games' initial builds require their documented toolchains.

## Controls

- **Arrow Keys** or **WASD**: Drive the car
- **Shift**: Boost speed
- Drift by turning while moving fast!

## Customization

Edit `js/config.js` to adjust:
- Physics parameters (drift, friction, acceleration)
- Visual settings (colors, fog, particle counts)
- World size and tree density
- Camera behavior

## Future Enhancements

Potential additions made easier by this architecture:

- **Collision Detection**: Add a `CollisionManager` class
- **Sound System**: Create an `AudioManager` module
- **Multiple Cars**: Extend `Car` class for AI opponents
- **Power-ups**: Add `PowerUpSystem` class
- **Track System**: Create `Track` class for defined courses
- **Scoring**: Add `ScoreManager` for drift scoring
- **Mobile Support**: Extend `InputManager` for touch controls

## Technical Notes

- Uses ES6 modules for clean imports/exports
- Three.js loaded via CDN with import maps
- Object-oriented design with clear class responsibilities
- No build step required - runs directly in browser
