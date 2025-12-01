import React, { useEffect, useState } from 'react';
import { workerManager } from '../core/WorkerManager';
import type { DistrictStats } from '../core/analysis';
import type { PrecinctData } from '../core/DataStore';

interface StatsPanelProps {
  selectedPrecinct?: PrecinctData | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ selectedPrecinct }) => {
  const [stats, setStats] = useState<DistrictStats[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await workerManager.sendMessage('RUN_ANALYSIS', {});
        setStats(result as DistrictStats[]);
      } catch (e) {
        console.error(e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute top-20 right-6 w-72 bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl p-5 transition-all duration-300 hover:bg-slate-900/90 max-h-[80vh] overflow-y-auto">
      {selectedPrecinct && (
        <div className="mb-6 pb-6 border-b border-slate-700/50">
          <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Selected County
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">FIPS ID</span>
              <span className="font-mono text-slate-200">{selectedPrecinct.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Population</span>
              <span className="font-mono text-slate-200">{selectedPrecinct.stats[0].toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">District</span>
              <span className="font-mono text-blue-400 font-bold">{selectedPrecinct.districtId}</span>
            </div>
            
            <div className="mt-4 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-blue-400">Democrat</span>
                <span className="text-slate-200">{selectedPrecinct.stats[1].toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-red-400">Republican</span>
                <span className="text-slate-200">{selectedPrecinct.stats[2].toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4 pt-2 border-t border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Demographics</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="block text-slate-500">White</span>
                  <span className="font-mono text-slate-200">{selectedPrecinct.stats[3].toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Black</span>
                  <span className="font-mono text-slate-200">{selectedPrecinct.stats[4].toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Hispanic</span>
                  <span className="font-mono text-slate-200">{selectedPrecinct.stats[5].toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
        District Statistics
      </h2>
      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.id} className="flex flex-col text-sm group hover:bg-white/5 p-2 rounded transition-colors border border-transparent hover:border-slate-700/50">
            <div className="flex justify-between items-center mb-1">
              <span className="text-blue-400 font-medium group-hover:text-blue-300">District {s.id}</span>
              <span className="text-slate-300 font-mono text-xs">{s.population.toLocaleString()} pop</span>
            </div>
            
            <div className="flex justify-between items-center text-xs mb-2">
              <span className={`font-bold ${s.efficiencyGap > 0 ? "text-red-400" : "text-emerald-400"}`}>
                EG: {s.efficiencyGap.toFixed(3)}
              </span>
              <div className="flex gap-2">
                <span className="text-blue-400">{((s.demVotes / (s.demVotes + s.repVotes)) * 100).toFixed(1)}% D</span>
                <span className="text-red-400">{((s.repVotes / (s.demVotes + s.repVotes)) * 100).toFixed(1)}% R</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs mb-2 text-slate-400">
              <span>BA+: {s.education.toFixed(1)}%</span>
              <span>Inc: ${Math.round(s.income).toLocaleString()}</span>
            </div>

            {/* Mini Demographic Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div style={{ width: `${(s.white / s.population) * 100}%` }} className="h-full bg-slate-400" title="White"></div>
              <div style={{ width: `${(s.black / s.population) * 100}%` }} className="h-full bg-purple-500" title="Black"></div>
              <div style={{ width: `${(s.hispanic / s.population) * 100}%` }} className="h-full bg-orange-500" title="Hispanic"></div>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs italic">
            Waiting for analysis...
          </div>
        )}
      </div>
    </div>
  );
};
