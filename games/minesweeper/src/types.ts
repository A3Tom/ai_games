/**
 * Game difficulty configuration
 */
export interface DifficultyConfig {
  rows: number;
  cols: number;
  mines: number;
}

/**
 * Individual cell in the minesweeper board
 */
export interface Cell {
  x: number;
  y: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborCount: number;
}

/**
 * Game state type
 */
export type GameState = 'idle' | 'playing' | 'won' | 'lost';

/**
 * Difficulty level type
 */
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Expert';

/**
 * Board type - 2D array of cells
 */
export type Board = Cell[][];

/**
 * Offset coordinate for neighbor cells
 */
export type Offset = [number, number];

/**
 * Game session statistics
 */
export interface GameSession {
  startTime: number;
  endTime?: number;
  result?: 'won' | 'lost' | 'reset';
  difficulty: DifficultyLevel;
}

/**
 * Progress tracking statistics
 */
export interface ProgressStats {
  gamesWon: number;
  gamesLost: number;
  gamesReset: number;
  totalGames: number;
  sessions: GameSession[];
  currentSession?: GameSession;
}
