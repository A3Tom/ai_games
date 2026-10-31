import { useState, useEffect } from 'react';
import { GAME_STATES } from '../constants';
import { GameState } from '../types';

/**
 * Custom hook to manage game timer
 */
export const useGameTimer = (gameState: GameState) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (gameState === GAME_STATES.PLAYING) {
      interval = setInterval(() => {
        setTime((prev) => Math.min(prev + 1, 999));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState]);

  const resetTimer = () => setTime(0);

  return { time, resetTimer };
};
