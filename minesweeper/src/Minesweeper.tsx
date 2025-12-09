import React, { useState, useEffect } from 'react';
import { DIFFICULTIES } from './constants';
import { DifficultySelector } from './components/DifficultySelector';
import { GameHeader } from './components/GameHeader';
import { Board } from './components/Board';
import { useGameState } from './hooks/useGameState';
import { useGameTimer } from './hooks/useGameTimer';
import { DifficultyLevel } from './types';

/**
 * Main Minesweeper game component
 */
export function Minesweeper() {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Beginner');

  const { board, gameState, mineCount, flagCount, resetGame, handleCellClick, handleRightClick } = useGameState(difficulty);

  const { time, resetTimer } = useGameTimer(gameState);

  // Reset game when difficulty changes
  useEffect(() => {
    resetGame();
    resetTimer();
  }, [difficulty, resetGame, resetTimer]);

  const handleReset = () => {
    resetGame();
    resetTimer();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <DifficultySelector difficulty={difficulty} onChange={setDifficulty} />

      <div className="bg-slate-300 p-4 rounded-lg shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)] border-t-4 border-l-4 border-white border-b-4 border-r-4 border-slate-400 select-none">
        <GameHeader mineCount={mineCount} flagCount={flagCount} gameState={gameState} time={time} onReset={handleReset} />

        <Board board={board} cols={DIFFICULTIES[difficulty].cols} onCellClick={handleCellClick} onCellRightClick={handleRightClick} />
      </div>

      <div className="mt-8 text-slate-500 text-sm max-w-md text-center">
        <p>
          <strong>Left Click</strong> to reveal. <strong>Right Click</strong> to flag.
        </p>
        <p className="mt-1">First click is always safe.</p>
      </div>
    </div>
  );
}
