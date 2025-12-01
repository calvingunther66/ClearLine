import React, { useState } from 'react';
import { workerManager } from '../core/WorkerManager';
import { DataStore } from '../core/DataStore';

interface ControlsPanelProps {
  dataStore: DataStore;
  onUpdate: () => void;
  onGenerateBorders: () => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({ dataStore, onUpdate, onGenerateBorders }) => {
  const [isRedistricting, setIsRedistricting] = useState(false);

  const handleAutoRedistrict = async () => {
    setIsRedistricting(true);
    try {
      const result = await workerManager.sendMessage('AUTO_REDISTRICT', { districtCount: 5 });
      const updates = result as { id: number; districtId: number }[];
      
      // Batch update DataStore
      updates.forEach(u => {
        dataStore.updatePrecinctDistrict(u.id, u.districtId);
      });
      
      onUpdate(); // Trigger re-render
    } catch (e) {
      console.error(e);
    } finally {
      setIsRedistricting(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-6 bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl p-5 w-72 transition-all duration-300 hover:bg-slate-900/90">
      <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Algorithms & Tools</h2>
      
      <div className="space-y-3">
        <button
          onClick={handleAutoRedistrict}
          disabled={isRedistricting}
          className="group relative w-full px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 hover:border-blue-500/50 text-blue-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 via-blue-600/10 to-blue-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide">Auto Redistrict (US)</span>
            {isRedistricting && <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>}
          </div>
        </button>

        <button
          onClick={async () => {
            setIsRedistricting(true);
            try {
              const result = await workerManager.sendMessage('SIMULATED_ANNEALING', { districtCount: 5 });
              const updates = result as { id: number; districtId: number }[];
              updates.forEach(u => dataStore.updatePrecinctDistrict(u.id, u.districtId));
              onUpdate();
            } catch (e) {
              console.error(e);
            } finally {
              setIsRedistricting(false);
            }
          }}
          disabled={isRedistricting}
          className="w-full px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 text-purple-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
        >
          <span className="text-xs font-bold uppercase tracking-wide">Simulated Annealing</span>
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
