/**
 * Game header with mine counter, reset button, and timer
 */
const GameHeader = ({ mineCount, flagCount, gameState, time, onReset }) => {
    const getSmiley = () => {
        if (gameState === GAME_STATES.WON) {
            return <Trophy size={24} className="text-yellow-600" />;
        }
        if (gameState === GAME_STATES.LOST) {
            return <Skull size={24} className="text-gray-700" />;
        }
        return <div className="text-yellow-500 font-bold text-xl">:)</div>;
    };

    return (
        <div className="flex justify-between items-center bg-slate-200 border-4 border-b-white border-r-white border-t-slate-400 border-l-slate-400 p-2 mb-4 inset-shadow">
            {/* Mine Counter */}
            <div className="bg-black px-2 py-1 text-red-600 font-mono text-3xl leading-none border-2 border-slate-400 border-b-white border-r-white w-20 text-center">
                {String(mineCount - flagCount).padStart(3, '0')}
            </div>

            {/* Reset Button */}
            <button 
                onClick={onReset}
                className="w-12 h-12 flex items-center justify-center bg-slate-300 border-4 border-white border-b-slate-500 border-r-slate-500 active:border-slate-500 active:border-b-white active:border-r-white active:bg-slate-200"
            >
                {getSmiley()}
            </button>

            {/* Timer */}
            <div className="bg-black px-2 py-1 text-red-600 font-mono text-3xl leading-none border-2 border-slate-400 border-b-white border-r-white w-20 text-center">
                {String(time).padStart(3, '0')}
            </div>
        </div>
    );
};
