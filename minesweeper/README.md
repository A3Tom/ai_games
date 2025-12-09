# Minesweeper

A classic Minesweeper game built with React and styled with Tailwind CSS.

## Project Structure

```
minesweeper/
├── index.html                      # Main HTML entry point
├── README.md                       # This file
└── js/
    ├── Minesweeper.js             # Main game component
    ├── main.js                    # App initialization
    ├── constants.js               # Game configuration and constants
    ├── board.js                   # Board logic and utilities
    ├── icons.js                   # SVG icon components
    ├── components/
    │   ├── Board.js               # Game board grid component
    │   ├── Cell.js                # Individual cell component
    │   ├── DifficultySelector.js  # Difficulty selection buttons
    │   └── GameHeader.js          # Header with counters and reset button
    └── hooks/
        ├── useGameState.js        # Game state management hook
        └── useGameTimer.js        # Timer management hook
```

## File Descriptions

### Core Files
- **`index.html`** - Entry point that loads React, ReactDOM, Babel, and Tailwind CSS from CDN
- **`js/Minesweeper.js`** - Main game component that orchestrates all other components
- **`js/main.js`** - Simple entry point that renders the Minesweeper component

### Configuration & Utilities
- **`js/constants.js`** - Contains:
  - `DIFFICULTIES` - Configuration for Beginner, Intermediate, and Expert levels
  - `NUMBER_COLORS` - Tailwind color classes for numbers 1-8
  - `OFFSETS` - Relative positions for finding neighboring cells
  - `GAME_STATES` - Enum for game states (idle, playing, won, lost)

- **`js/board.js`** - Board manipulation functions:
  - `createEmptyBoard()` - Initialize empty board
  - `placeMines()` - Randomly place mines and calculate neighbor counts
  - `revealCell()` - Recursively reveal cells
  - `revealAllMines()` - Show all mines (on game loss)
  - `flagAllMines()` - Flag all mines (on game win)
  - `checkWin()` - Check if player has won

### Components
- **`js/components/Cell.js`** - Individual cell with reveal/flag states
- **`js/components/Board.js`** - Grid container that renders all cells
- **`js/components/GameHeader.js`** - Top bar with mine counter, reset button, and timer
- **`js/components/DifficultySelector.js`** - Buttons to switch difficulty levels

### Custom Hooks
- **`js/hooks/useGameState.js`** - Manages:
  - Board state
  - Game state (idle, playing, won, lost)
  - Mine and flag counts
  - Cell click handlers
  
- **`js/hooks/useGameTimer.js`** - Manages the game timer that starts on first click

### Icons
- **`js/icons.js`** - SVG components for Flag, Bomb, Trophy, and Skull icons

## How to Run

Simply open `index.html` in a modern web browser. No build process or server required.

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
- **Tailwind CSS** - Styling
- **Babel Standalone** - JSX transformation in the browser

## Architecture Benefits

The modular structure provides:

1. **Separation of Concerns** - Logic, UI, and state management are separated
2. **Reusability** - Components and utilities can be easily tested and reused
3. **Maintainability** - Easy to locate and modify specific functionality
4. **Scalability** - Simple to add new features (e.g., custom difficulties, sound effects)
5. **Readability** - Clean, focused files with single responsibilities
