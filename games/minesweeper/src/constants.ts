import { DifficultyConfig, Offset, DifficultyLevel, GameState } from './types';

/**
 * Game difficulty configurations
 */
export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  Beginner: { rows: 9, cols: 9, mines: 10 },
  Intermediate: { rows: 16, cols: 16, mines: 40 },
  Expert: { rows: 16, cols: 30, mines: 99 },
};

/**
 * Color classes for numbers 1-8
 */
export const NUMBER_COLORS: string[] = [
  '',
  'text-blue-600',
  'text-green-600',
  'text-red-600',
  'text-indigo-800',
  'text-red-900',
  'text-teal-600',
  'text-black',
  'text-gray-600',
];

/**
 * Relative positions of neighboring cells
 */
export const OFFSETS: Offset[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/**
 * Game states
 */
export const GAME_STATES: Record<string, GameState> = {
  IDLE: 'idle',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
};
