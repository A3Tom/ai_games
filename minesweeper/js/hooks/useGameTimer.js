/**
 * Custom hook to manage game timer
 */
const useGameTimer = (gameState) => {
    const { useState, useEffect } = React;
    const [time, setTime] = useState(0);

    useEffect(() => {
        let interval;
        if (gameState === GAME_STATES.PLAYING) {
            interval = setInterval(() => {
                setTime(prev => Math.min(prev + 1, 999));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    const resetTimer = () => setTime(0);

    return { time, resetTimer };
};
