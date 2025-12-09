import React from 'react';
import { ProgressStats } from '../types';

interface ProgressPanelProps {
  stats: ProgressStats;
  onReset: () => void;
  fastestTime: number | null;
  averageTime: number | null;
}

/**
 * Progress tracking panel component
 */
export const ProgressPanel: React.FC<ProgressPanelProps> = ({ stats, onReset, fastestTime, averageTime }) => {
  const { gamesWon, gamesLost, gamesReset, totalGames, currentSession } = stats;

  const winRate = totalGames > 0 ? ((gamesWon / totalGames) * 100).toFixed(1) : '0.0';

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatTime = (ms: number | null) => {
    if (ms === null) return '--:--';
    return formatDuration(ms);
  };

  const currentGameDuration = currentSession 
    ? formatDuration(Date.now() - currentSession.startTime)
    : '0:00';

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-6 w-full max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Progress Tracking</h2>
        <button
          onClick={onReset}
          className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          title="Reset all statistics"
        >
          Reset Stats
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-green-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{gamesWon}</div>
          <div className="text-xs text-green-600 uppercase">Won</div>
        </div>
        <div className="bg-red-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-red-700">{gamesLost}</div>
          <div className="text-xs text-red-600 uppercase">Lost</div>
        </div>
        <div className="bg-yellow-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">{gamesReset}</div>
          <div className="text-xs text-yellow-600 uppercase">Reset</div>
        </div>
        <div className="bg-blue-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{winRate}%</div>
          <div className="text-xs text-blue-600 uppercase">Win Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-purple-50 rounded p-3 text-center border border-purple-100">
          <div className="text-xl font-bold text-purple-700">{formatTime(fastestTime)}</div>
          <div className="text-xs text-purple-600 uppercase">Fastest Time</div>
        </div>
        <div className="bg-indigo-50 rounded p-3 text-center border border-indigo-100">
          <div className="text-xl font-bold text-indigo-700">{formatTime(averageTime)}</div>
          <div className="text-xs text-indigo-600 uppercase">Average Time</div>
        </div>
      </div>

      {currentSession && (
        <div className="bg-slate-50 rounded p-3 text-center border border-slate-200">
          <div className="text-sm text-slate-600 mb-1">Current Game</div>
          <div className="text-lg font-semibold text-slate-800">
            {currentGameDuration}
            <span className="text-sm text-slate-500 ml-2">({currentSession.difficulty})</span>
          </div>
        </div>
      )}

      {totalGames === 0 && !currentSession && (
        <div className="text-center text-slate-400 text-sm py-2">
          No games played yet. Start playing to track your progress!
        </div>
      )}
    </div>
  );
};
