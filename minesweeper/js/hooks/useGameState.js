/**
 * Custom hook to manage all game state and logic
 */
const useGameState = (difficulty) => {
    const { useState, useCallback } = React;
    const [board, setBoard] = useState([]);
    const [gameState, setGameState] = useState(GAME_STATES.IDLE);
    const [mineCount, setMineCount] = useState(0);
    const [flagCount, setFlagCount] = useState(0);

    const resetGame = useCallback(() => {
        const { rows, cols, mines } = DIFFICULTIES[difficulty];
        setBoard(createEmptyBoard(rows, cols));
        setGameState(GAME_STATES.IDLE);
        setMineCount(mines);
        setFlagCount(0);
    }, [difficulty]);

    const handleCellClick = useCallback((x, y) => {
        if (gameState === GAME_STATES.WON || gameState === GAME_STATES.LOST) return;
        if (board[y][x].isFlagged) return;

        let newBoard = board.map(row => [...row]);
        const { rows, cols, mines } = DIFFICULTIES[difficulty];

        // Initialize board on first click
        if (gameState === GAME_STATES.IDLE) {
            setGameState(GAME_STATES.PLAYING);
            newBoard = placeMines(newBoard, rows, cols, mines, x, y);
        }

        // Check if clicked on a mine
        if (newBoard[y][x].isMine) {
            revealAllMines(newBoard);
            setGameState(GAME_STATES.LOST);
            setBoard(newBoard);
            return;
        }

        // Reveal the cell
        revealCell(newBoard, x, y, rows, cols);
        
        // Check for win
        if (checkWin(newBoard, rows, cols, mines)) {
            setGameState(GAME_STATES.WON);
            flagAllMines(newBoard);
            setFlagCount(mines);
        }
        
        setBoard(newBoard);
    }, [board, gameState, difficulty]);

    const handleRightClick = useCallback((e, x, y) => {
        e.preventDefault();
        if (gameState === GAME_STATES.WON || gameState === GAME_STATES.LOST) return;
        if (board[y][x].isRevealed) return;

        const newBoard = board.map(row => [...row]);
        const cell = newBoard[y][x];

        if (!cell.isFlagged && flagCount < mineCount) {
            cell.isFlagged = true;
            setFlagCount(prev => prev + 1);
        } else if (cell.isFlagged) {
            cell.isFlagged = false;
            setFlagCount(prev => prev - 1);
        }
        
        setBoard(newBoard);
    }, [board, gameState, flagCount, mineCount]);

    return {
        board,
        gameState,
        mineCount,
        flagCount,
        resetGame,
        handleCellClick,
        handleRightClick
    };
};
