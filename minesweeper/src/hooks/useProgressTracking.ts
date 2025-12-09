import { useState, useCallback } from 'react';
import { ProgressStats, GameSession, DifficultyLevel, GameState } from '../types';
import { GAME_STATES } from '../constants';

/**
 * Custom hook to manage game progress tracking
 */
export const useProgressTracking = () => {
  const [stats, setStats] = useState<ProgressStats>(() => {
    // Load stats from localStorage if available
    const saved = localStorage.getItem('minesweeper-stats');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          gamesWon: 0,
          gamesLost: 0,
          gamesReset: 0,
          totalGames: 0,
          sessions: [],
        };
      }
    }
    return {
      gamesWon: 0,
      gamesLost: 0,
      gamesReset: 0,
      totalGames: 0,
      sessions: [],
    };
  });

  const startGame = useCallback((difficulty: DifficultyLevel) => {
    const session: GameSession = {
      startTime: Date.now(),
      difficulty,
    };
    
    setStats((prev) => {
      const newStats = {
        ...prev,
        currentSession: session,
      };
      localStorage.setItem('minesweeper-stats', JSON.stringify(newStats));
      return newStats;
    });
  }, []);

  const endGame = useCallback((result: 'won' | 'lost' | 'reset') => {
    setStats((prev) => {
      if (!prev.currentSession) return prev;

      const endedSession: GameSession = {
        ...prev.currentSession,
        endTime: Date.now(),
        result,
      };

      const newStats: ProgressStats = {
        gamesWon: prev.gamesWon + (result === 'won' ? 1 : 0),
        gamesLost: prev.gamesLost + (result === 'lost' ? 1 : 0),
        gamesReset: prev.gamesReset + (result === 'reset' ? 1 : 0),
        totalGames: prev.totalGames + 1,
        sessions: [...prev.sessions, endedSession],
        currentSession: undefined,
      };

      localStorage.setItem('minesweeper-stats', JSON.stringify(newStats));
      return newStats;
    });
  }, []);

  const resetStats = useCallback(() => {
    const emptyStats: ProgressStats = {
      gamesWon: 0,
      gamesLost: 0,
      gamesReset: 0,
      totalGames: 0,
      sessions: [],
    };
    setStats(emptyStats);
    localStorage.setItem('minesweeper-stats', JSON.stringify(emptyStats));
  }, []);

  return {
    stats,
    startGame,
    endGame,
    resetStats,
  };
};
