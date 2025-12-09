import { useState, useCallback } from 'react';
import { DIFFICULTIES, GAME_STATES } from '../constants';
import { createEmptyBoard, placeMines, revealCell, revealAllMines, flagAllMines, checkWin } from '../board';
import { Board, GameState, DifficultyLevel } from '../types';

/**
 * Custom hook to manage all game state and logic
 */
export const useGameState = (difficulty: DifficultyLevel) => {
  const [board, setBoard] = useState<Board>([]);
  const [gameState, setGameState] = useState<GameState>(GAME_STATES.IDLE as GameState);
  const [mineCount, setMineCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);

  const resetGame = useCallback(() => {
    const { rows, cols, mines } = DIFFICULTIES[difficulty];
    setBoard(createEmptyBoard(rows, cols));
    setGameState(GAME_STATES.IDLE as GameState);
    setMineCount(mines);
    setFlagCount(0);
  }, [difficulty]);

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (gameState === GAME_STATES.WON || gameState === GAME_STATES.LOST) return;
      if (board[y][x].isFlagged) return;

      let newBoard = board.map((row) => [...row]);
      const { rows, cols, mines } = DIFFICULTIES[difficulty];

      // Initialize board on first click
      if (gameState === GAME_STATES.IDLE) {
        setGameState(GAME_STATES.PLAYING as GameState);
        newBoard = placeMines(newBoard, rows, cols, mines, x, y);
      }

      // Check if clicked on a mine
      if (newBoard[y][x].isMine) {
        revealAllMines(newBoard);
        setGameState(GAME_STATES.LOST as GameState);
        setBoard(newBoard);
        return;
      }

      // Reveal the cell
      revealCell(newBoard, x, y, rows, cols);

      // Check for win
      if (checkWin(newBoard, rows, cols, mines)) {
        setGameState(GAME_STATES.WON as GameState);
        flagAllMines(newBoard);
        setFlagCount(mines);
      }

      setBoard(newBoard);
    },
    [board, gameState, difficulty]
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent, x: number, y: number) => {
      e.preventDefault();
      if (gameState === GAME_STATES.WON || gameState === GAME_STATES.LOST) return;
      if (board[y][x].isRevealed) return;

      const newBoard = board.map((row) => [...row]);
      const cell = newBoard[y][x];

      if (!cell.isFlagged && flagCount < mineCount) {
        cell.isFlagged = true;
        setFlagCount((prev) => prev + 1);
      } else if (cell.isFlagged) {
        cell.isFlagged = false;
        setFlagCount((prev) => prev - 1);
      }

      setBoard(newBoard);
    },
    [board, gameState, flagCount, mineCount]
  );

  return {
    board,
    gameState,
    mineCount,
    flagCount,
    resetGame,
    handleCellClick,
    handleRightClick,
  };
};
