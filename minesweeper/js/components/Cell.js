/**
 * Individual cell component
 */
const Cell = ({ cell, onClick, onRightClick }) => {
    const { isRevealed, isFlagged, isMine, neighborCount } = cell;

    let cellStyle = "w-8 h-8 flex items-center justify-center text-sm font-bold select-none cursor-pointer border ";
    
    if (!isRevealed) {
        cellStyle += "bg-slate-300 border-t-slate-100 border-l-slate-100 border-b-slate-500 border-r-slate-500 hover:bg-slate-200";
    } else {
        cellStyle += "bg-slate-200 border-slate-300 ";
        if (isMine) {
            cellStyle += "bg-red-500 border-none";
        }
    }

    const renderContent = () => {
        if (isFlagged) {
            return <Flag size={16} className="text-red-600 fill-red-600" />;
        }
        if (!isRevealed) return null;
        
        if (isMine) {
            return <Bomb size={18} className="text-black fill-black/50" />;
        }
        
        if (neighborCount > 0) {
            return <span className={NUMBER_COLORS[neighborCount]}>{neighborCount}</span>;
        }
        return null;
    };

    return (
        <div 
            className={cellStyle}
            onClick={onClick}
            onContextMenu={onRightClick}
            role="button"
        >
            {renderContent()}
        </div>
    );
};
