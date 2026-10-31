import React from 'react';
import { Cell } from './Cell';
import { Board as BoardType } from '../types';

interface BoardProps {
  board: BoardType;
  cols: number;
  onCellClick: (x: number, y: number) => void;
  onCellRightClick: (e: React.MouseEvent, x: number, y: number) => void;
}

/**
 * Game board component that renders all cells
 */
export const Board: React.FC<BoardProps> = ({ board, cols, onCellClick, onCellRightClick }) => {
  return (
    <div className="border-4 border-slate-400 border-b-white border-r-white relative">
      <div className="grid bg-slate-400 gap-[1px]" style={{ gridTemplateColumns: `repeat(${cols}, min-content)` }}>
        {board.map((row, y) =>
          row.map((cell, x) => (
            <Cell
              key={`${x}-${y}`}
              cell={cell}
              onClick={() => onCellClick(x, y)}
              onRightClick={(e) => onCellRightClick(e, x, y)}
            />
          ))
        )}
      </div>
    </div>
  );
};
