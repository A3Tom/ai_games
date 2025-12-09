import React from 'react';
import { DIFFICULTIES } from '../constants';
import { DifficultyLevel } from '../types';

interface DifficultySelectorProps {
  difficulty: DifficultyLevel;
  onChange: (difficulty: DifficultyLevel) => void;
}

/**
 * Difficulty selection buttons
 */
export const DifficultySelector: React.FC<DifficultySelectorProps> = ({ difficulty, onChange }) => {
  return (
    <div className="mb-6 flex gap-4 bg-white p-2 rounded-lg shadow-sm">
      {(Object.keys(DIFFICULTIES) as DifficultyLevel[]).map((diff) => (
        <button
          key={diff}
          onClick={() => onChange(diff)}
          className={`px-4 py-1 rounded-md text-sm font-semibold transition-colors
                        ${difficulty === diff ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {diff}
        </button>
      ))}
    </div>
  );
};
