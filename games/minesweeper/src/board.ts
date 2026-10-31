import { Board, Cell } from './types';
import { OFFSETS } from './constants';

/**
 * Creates an empty board with default cell values
 */
export const createEmptyBoard = (rows: number, cols: number): Board => {
  const board: Board = [];
  for (let y = 0; y < rows; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < cols; x++) {
      row.push({
        x,
        y,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborCount: 0,
      });
    }
    board.push(row);
  }
  return board;
};

/**
 * Places mines randomly on the board, avoiding the safe cell
 * and calculates neighbor counts for all cells
 */
export const placeMines = (
  board: Board,
  rows: number,
  cols: number,
  mines: number,
  safeX: number,
  safeY: number
): Board => {
  let minesPlaced = 0;

  // Place mines randomly
  while (minesPlaced < mines) {
    const x = Math.floor(Math.random() * cols);
    const y = Math.floor(Math.random() * rows);

    if (!board[y][x].isMine && (x !== safeX || y !== safeY)) {
      board[y][x].isMine = true;
      minesPlaced++;
    }
  }

  // Calculate neighbor counts
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!board[y][x].isMine) {
        let count = 0;
        OFFSETS.forEach(([dy, dx]) => {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && board[ny][nx].isMine) {
            count++;
          }
        });
        board[y][x].neighborCount = count;
      }
    }
  }

  return board;
};

/**
 * Recursively reveals a cell and its neighbors if it has no adjacent mines
 */
export const revealCell = (
  board: Board,
  x: number,
  y: number,
  rows: number,
  cols: number
): void => {
  if (x < 0 || x >= cols || y < 0 || y >= rows || board[y][x].isRevealed || board[y][x].isFlagged) {
    return;
  }

  board[y][x].isRevealed = true;

  // If no neighboring mines, recursively reveal adjacent cells
  if (board[y][x].neighborCount === 0) {
    OFFSETS.forEach(([dy, dx]) => {
      revealCell(board, x + dx, y + dy, rows, cols);
    });
  }
};

/**
 * Reveals all mines on the board (used when game is lost)
 */
export const revealAllMines = (board: Board): void => {
  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.isMine) cell.isRevealed = true;
    });
  });
};

/**
 * Flags all mines on the board (used when game is won)
 */
export const flagAllMines = (board: Board): void => {
  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.isMine) cell.isFlagged = true;
    });
  });
};

/**
 * Checks if the player has won by revealing all non-mine cells
 */
export const checkWin = (board: Board, rows: number, cols: number, mines: number): boolean => {
  let revealedCount = 0;
  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.isRevealed) revealedCount++;
    });
  });
  return revealedCount === rows * cols - mines;
};
