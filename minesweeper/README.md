# Minesweeper

A classic Minesweeper game built with React, TypeScript, and styled with Tailwind CSS.

## Project Structure

```
minesweeper/
├── index.html                      # Legacy HTML (Babel version)
├── index-new.html                  # New TypeScript build entry point
├── README.md                       # This file
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite build configuration
├── tailwind.config.js              # Tailwind CSS configuration
├── postcss.config.js               # PostCSS configuration
├── js/                             # Legacy JavaScript files (deprecated)
└── src/                            # TypeScript source files
    ├── types.ts                    # TypeScript type definitions
    ├── constants.ts                # Game configuration and constants
    ├── board.ts                    # Board logic and utilities
    ├── Minesweeper.tsx             # Main game component
    ├── main.tsx                    # App initialization
    ├── index.css                   # Global styles
    ├── components/
    │   ├── icons.tsx               # SVG icon components
    │   ├── Board.tsx               # Game board grid component
    │   ├── Cell.tsx                # Individual cell component
    │   ├── DifficultySelector.tsx  # Difficulty selection buttons
    │   └── GameHeader.tsx          # Header with counters and reset button
    └── hooks/
        ├── useGameState.ts         # Game state management hook
        └── useGameTimer.ts         # Timer management hook
```

## File Descriptions

### Core Files
- **`src/types.ts`** - TypeScript type definitions for Cell, Board, GameState, DifficultyLevel, etc.
- **`src/Minesweeper.tsx`** - Main game component that orchestrates all other components
- **`src/main.tsx`** - Entry point that renders the Minesweeper component
- **`src/index.css`** - Global styles including Tailwind directives

### Configuration & Utilities
- **`src/constants.ts`** - Typed constants containing:
  - `DIFFICULTIES` - Configuration for Beginner, Intermediate, and Expert levels
  - `NUMBER_COLORS` - Tailwind color classes for numbers 1-8
  - `OFFSETS` - Relative positions for finding neighboring cells
  - `GAME_STATES` - Game state constants (idle, playing, won, lost)

- **`src/board.ts`** - Typed board manipulation functions:
  - `createEmptyBoard()` - Initialize empty board
  - `placeMines()` - Randomly place mines and calculate neighbor counts
  - `revealCell()` - Recursively reveal cells
  - `revealAllMines()` - Show all mines (on game loss)
  - `flagAllMines()` - Flag all mines (on game win)
  - `checkWin()` - Check if player has won

### Components (React with TypeScript)
- **`src/components/Cell.tsx`** - Individual cell with reveal/flag states
- **`src/components/Board.tsx`** - Grid container that renders all cells
- **`src/components/GameHeader.tsx`** - Top bar with mine counter, reset button, and timer
- **`src/components/DifficultySelector.tsx`** - Buttons to switch difficulty levels
- **`src/components/icons.tsx`** - SVG icon components (Flag, Bomb, Trophy, Skull)

### Custom Hooks (TypeScript)
- **`src/hooks/useGameState.ts`** - Typed hook that manages:
  - Board state
  - Game state (idle, playing, won, lost)
  - Mine and flag counts
  - Cell click handlers with proper type safety
  
- **`src/hooks/useGameTimer.ts`** - Typed hook that manages the game timer

### Build Configuration
- **`tsconfig.json`** - TypeScript compiler configuration with strict mode enabled
- **`vite.config.ts`** - Vite bundler configuration for development and production
- **`tailwind.config.js`** - Tailwind CSS configuration
- **`postcss.config.js`** - PostCSS configuration for Tailwind processing
- **`package.json`** - Dependencies and npm scripts

## Quick Start

### Development (Recommended - TypeScript)

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

### Legacy Version (JavaScript/Babel)

Open `index-legacy.html` directly in your browser (no build required).

## Project Files

- **`index.html`** - TypeScript/React build entry point (default)
- **`index-legacy.html`** - Legacy Babel version with inline scripts
- **`src/`** - TypeScript source files (active development)
- **`js/`** - Legacy JavaScript files (deprecated, kept for reference)

## How to Play

- **Left Click** on a cell to reveal it
- **Right Click** on a cell to place/remove a flag
- First click is always safe (no mine)
- Numbers indicate how many adjacent cells contain mines
- Flag all mines to win!

## Difficulty Levels

| Level        | Grid Size | Mines |
|--------------|-----------|-------|
| Beginner     | 9x9       | 10    |
| Intermediate | 16x16     | 40    |
| Expert       | 16x30     | 99    |

## Technologies Used

- **React 18** - UI framework
- **TypeScript 5.3** - Type-safe JavaScript with enhanced developer experience
- **Vite 5** - Fast build tool and development server
- **Tailwind CSS** - Utility-first styling
- **PostCSS** - CSS processing

## NPM Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (TypeScript compilation + Vite bundling)
- `npm run preview` - Preview production build locally
- `npm run type-check` - Run TypeScript type checking without emitting files

## TypeScript Benefits

The TypeScript conversion provides:

1. **Type Safety** - Catch errors at compile time instead of runtime
2. **Better IDE Support** - Enhanced autocomplete, refactoring, and navigation
3. **Self-Documenting Code** - Types serve as inline documentation
4. **Easier Refactoring** - Confident code changes with type checking
5. **Enhanced Maintainability** - Explicit interfaces and type definitions
6. **Modern Tooling** - Vite provides fast HMR and optimized production builds

## Architecture Benefits

The modular structure provides:

1. **Separation of Concerns** - Logic, UI, and state management are separated
2. **Reusability** - Components and utilities can be easily tested and reused
3. **Type Safety** - All functions, components, and hooks are fully typed
4. **Maintainability** - Easy to locate and modify specific functionality
5. **Scalability** - Simple to add new features with TypeScript's compile-time checks
6. **Readability** - Clean, focused files with single responsibilities and type annotations
