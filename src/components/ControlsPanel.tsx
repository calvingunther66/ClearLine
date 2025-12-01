import React, { useState } from 'react';


interface ControlsPanelProps {
  onUpdate: () => void;
  onGenerateBorders: () => void;
  viewMode: 'district' | 'political';
  onSetViewMode: (mode: 'district' | 'political') => void;
  onAutoRedistrict: (config: { runs: number; isAuto: boolean }) => Promise<void>;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({ 
  onUpdate, 
  onGenerateBorders, 
  viewMode, 
  onSetViewMode,
  onAutoRedistrict
}) => {
  const [isRedistricting, setIsRedistricting] = useState(false);
  const [runs, setRuns] = useState(1);
  const [isAuto, setIsAuto] = useState(false);

  const handleRedistrictClick = async () => {
    setIsRedistricting(true);
    try {
      await onAutoRedistrict({ runs, isAuto });
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRedistricting(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-6 bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl p-5 w-72 transition-all duration-300 hover:bg-slate-900/90">
      <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Map Controls</h2>
      
      <div className="flex bg-slate-800/50 p-1 rounded-lg mb-4">
        <button
          onClick={() => onSetViewMode('district')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            viewMode === 'district' 
              ? 'bg-slate-600 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Districts
        </button>
        <button
          onClick={() => onSetViewMode('political')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            viewMode === 'political' 
              ? 'bg-blue-600/80 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Political
        </button>
      </div>

      <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Algorithms</h2>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded border border-slate-700 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">Ensemble Runs</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isAuto} 
                onChange={(e) => setIsAuto(e.target.checked)}
                className="w-3 h-3 rounded border-slate-600 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-slate-900"
              />
              <span className="text-[10px] text-slate-400 uppercase font-bold">Auto</span>
            </label>
          </div>
          <input 
            type="number" 
            min="1" 
            max="100000" 
            value={runs} 
            disabled={isAuto}
            onChange={(e) => setRuns(Math.max(1, Math.min(100000, parseInt(e.target.value) || 1)))}
            className={`w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right text-xs text-slate-200 focus:outline-none focus:border-blue-500 ${isAuto ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>

        <button
          onClick={handleRedistrictClick}
          disabled={isRedistricting}
          className="group relative w-full px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 text-purple-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/0 via-purple-600/10 to-purple-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide">Auto Redistrict (SA)</span>
            {isRedistricting && <span className="w-2 h-2 bg-purple-400 rounded-full animate-ping"></span>}
          </div>
        </button>

        <div className="h-px bg-slate-700/50 my-2"></div>

        <button
          onClick={onGenerateBorders}
          className="w-full px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-100 rounded-lg transition-all flex items-center justify-between"
        >
          <span className="text-xs font-bold uppercase tracking-wide">Generate Borders</span>
          <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
