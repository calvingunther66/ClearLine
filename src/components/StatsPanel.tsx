import React, { useEffect, useState } from 'react';
import { workerManager } from '../core/WorkerManager';
import type { DistrictStats } from '../core/analysis';

export const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<DistrictStats[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Poll for stats (in real app, use subscription)
      // For now, trigger a dummy analysis
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
    <div className="absolute top-20 right-6 w-72 bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl p-5 transition-all duration-300 hover:bg-slate-900/90">
      <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
        District Statistics
      </h2>
      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.id} className="flex justify-between items-center text-sm group hover:bg-white/5 p-2 rounded transition-colors">
            <span className="text-blue-400 font-medium group-hover:text-blue-300">District {s.id}</span>
            <div className="flex flex-col items-end">
              <span className="text-slate-300 font-mono text-xs">{s.population.toLocaleString()} pop</span>
              <span className={`text-xs font-bold ${s.efficiencyGap > 0 ? "text-red-400" : "text-emerald-400"}`}>
                EG: {s.efficiencyGap.toFixed(3)}
              </span>
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
