// Game difficulty configurations
const DIFFICULTIES = {
    Beginner: { rows: 9, cols: 9, mines: 10 },
    Intermediate: { rows: 16, cols: 16, mines: 40 },
    Expert: { rows: 16, cols: 30, mines: 99 },
};

// Color classes for numbers 1-8
const NUMBER_COLORS = [
    '',
    'text-blue-600',
    'text-green-600',
    'text-red-600',
    'text-indigo-800',
    'text-red-900',
    'text-teal-600',
    'text-black',
    'text-gray-600'
];

// Relative positions of neighboring cells
const OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
];

// Game states
const GAME_STATES = {
    IDLE: 'idle',
    PLAYING: 'playing',
    WON: 'won',
    LOST: 'lost'
};
