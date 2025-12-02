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
        // The worker returns { analysis, projections }, so we need to extract analysis
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setStats((result as any).analysis as DistrictStats[]);
      } catch (e) {
        console.error(e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute top-32 right-6 w-72 bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl p-5 transition-all duration-300 hover:bg-slate-900/90 max-h-[80vh] overflow-y-auto">
      {selectedPrecinct && (
        <div className="mb-6 pb-6 border-b border-slate-700/50">
          <h2 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Selected County
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Precinct ID</span>
              <span className="font-mono text-slate-200">{selectedPrecinct.id}</span>
            </div>
            {selectedPrecinct.countyId && (
              <div className="flex justify-between">
                <span className="text-slate-400">County ID</span>
                <span className="font-mono text-slate-500">{selectedPrecinct.countyId}</span>
              </div>
            )}
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

            {/* Historical Trends */}
            {selectedPrecinct.history && selectedPrecinct.history.length > 0 && (
              <div className="mt-4 pt-2 border-t border-slate-800">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between">
                  <span>Trends (1980-2030)</span>
                  <span className="text-emerald-400">
                    {((selectedPrecinct.stats[0] - selectedPrecinct.history[0].population) / selectedPrecinct.history[0].population * 100).toFixed(1)}% Growth
                  </span>
                </h3>
                <div className="flex items-end gap-1 h-16 mt-2 border-b border-slate-700/50 pb-1 relative">
                  {(() => {
                    // Prepare data for regression
                    const historyData = selectedPrecinct.history!.map(h => ({ x: h.year, y: h.population }));
                    historyData.push({ x: 2020, y: selectedPrecinct.stats[0] });
                    
                    // Simple Linear Regression inline (since we can't easily import the helper here without refactoring imports or moving logic)
                    // Actually, let's just do it inline for the UI component or import it if possible.
                    // Importing from core/analysis might cause circular deps if not careful, but usually components -> core is fine.
                    // Let's implement a simple helper here to avoid import issues for now.
                    const n = historyData.length;
                    const sumX = historyData.reduce((a, b) => a + b.x, 0);
                    const sumY = historyData.reduce((a, b) => a + b.y, 0);
                    const sumXY = historyData.reduce((a, b) => a + b.x * b.y, 0);
                    const sumXX = historyData.reduce((a, b) => a + b.x * b.x, 0);
                    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                    const intercept = (sumY - slope * sumX) / n;
                    
                    const project = (year: number) => slope * year + intercept;
                    
                    const maxPop = Math.max(
                      ...historyData.map(d => d.y), 
                      project(2030)
                    );

                    return (
                      <>
                        {/* History Bars */}
                        {selectedPrecinct.history!.map((h) => (
                          <div key={h.year} className="flex-1 flex flex-col justify-end group relative">
                            <div 
                              className="bg-blue-500/50 hover:bg-blue-400 transition-all rounded-t-sm"
                              style={{ height: `${(h.population / maxPop) * 100}%` }}
                            ></div>
                            <span className="text-[6px] text-slate-500 text-center mt-1 rotate-[-45deg] origin-top-left translate-y-2">{h.year}</span>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                              {h.population.toLocaleString()}
                            </div>
                          </div>
                        ))}
                        
                        {/* Current Year */}
                        <div className="flex-1 flex flex-col justify-end group relative">
                          <div 
                            className="bg-blue-500 hover:bg-blue-400 transition-all rounded-t-sm"
                            style={{ height: `${(selectedPrecinct.stats[0] / maxPop) * 100}%` }}
                          ></div>
                          <span className="text-[6px] text-slate-300 text-center mt-1 font-bold rotate-[-45deg] origin-top-left translate-y-2">2020</span>
                           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                              {selectedPrecinct.stats[0].toLocaleString()}
                            </div>
                        </div>

                        {/* Projections */}
                        {[2025, 2030].map(year => {
                           const val = project(year);
                           return (
                            <div key={year} className="flex-1 flex flex-col justify-end group relative opacity-70">
                              <div 
                                className="bg-emerald-500/30 border border-emerald-500/50 border-dashed hover:bg-emerald-400/50 transition-all rounded-t-sm"
                                style={{ height: `${(val / maxPop) * 100}%` }}
                              ></div>
                              <span className="text-[6px] text-emerald-500 text-center mt-1 rotate-[-45deg] origin-top-left translate-y-2">{year}</span>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 border border-slate-600 text-emerald-400">
                                {Math.round(val).toLocaleString()} (Proj)
                              </div>
                            </div>
                           );
                        })}
                      </>
                    );
                  })()}
                </div>
                
                {/* Demographic Trends */}
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mt-3 mb-2">Demographic Trends</h3>
                <div className="h-16 flex items-end gap-1 border-b border-slate-700/50 pb-1 relative">
                   {/* Legend */}
                   <div className="absolute top-0 right-0 flex gap-2 text-[8px]">
                      <span className="text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>W</span>
                      <span className="text-purple-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>B</span>
                      <span className="text-orange-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>H</span>
                   </div>

                  {selectedPrecinct.history.map((h) => {
                    // Let's show stacked bars for W/B/H as % of population
                    return (
                      <div key={h.year} className="flex-1 flex flex-col justify-end h-full group/bar relative">
                        <div className="w-full bg-orange-500/80" style={{ height: `${(h.hispanic / h.population) * 100}%` }}></div>
                        <div className="w-full bg-purple-500/80" style={{ height: `${(h.black / h.population) * 100}%` }}></div>
                        <div className="w-full bg-slate-400/80" style={{ height: `${(h.white / h.population) * 100}%` }}></div>
                        
                        <span className="text-[8px] text-slate-500 text-center mt-0.5 opacity-0 group-hover/bar:opacity-100 absolute bottom-[-12px] w-full">{h.year}</span>
                      </div>
                    );
                  })}
                  {/* Current Year */}
                   <div className="flex-1 flex flex-col justify-end h-full group/bar relative">
                      <div className="w-full bg-orange-500" style={{ height: `${(selectedPrecinct.stats[5] / selectedPrecinct.stats[0]) * 100}%` }}></div>
                      <div className="w-full bg-purple-500" style={{ height: `${(selectedPrecinct.stats[4] / selectedPrecinct.stats[0]) * 100}%` }}></div>
                      <div className="w-full bg-slate-400" style={{ height: `${(selectedPrecinct.stats[3] / selectedPrecinct.stats[0]) * 100}%` }}></div>
                      <span className="text-[8px] text-slate-300 font-bold text-center mt-0.5 absolute bottom-[-12px] w-full">2020</span>
                   </div>
                </div>
              </div>
            )}
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
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex mb-2">
              <div style={{ width: `${(s.white / s.population) * 100}%` }} className="h-full bg-slate-400" title="White"></div>
              <div style={{ width: `${(s.black / s.population) * 100}%` }} className="h-full bg-purple-500" title="Black"></div>
              <div style={{ width: `${(s.hispanic / s.population) * 100}%` }} className="h-full bg-orange-500" title="Hispanic"></div>
            </div>

            {/* District History Sparkline */}
            {s.history && s.history.length > 0 && (
              <div className="flex items-end gap-0.5 h-6 mt-1 opacity-50 group-hover:opacity-100 transition-opacity">
                {s.history.map((h) => (
                  <div 
                    key={h.year} 
                    className="flex-1 bg-emerald-500/50 rounded-t-[1px]"
                    style={{ height: `${(h.population / Math.max(...s.history!.map(x => x.population), s.population)) * 100}%` }}
                    title={`${h.year}: ${h.population.toLocaleString()}`}
                  ></div>
                ))}
                <div 
                  className="flex-1 bg-emerald-500 rounded-t-[1px]"
                  style={{ height: `${(s.population / Math.max(...s.history!.map(x => x.population), s.population)) * 100}%` }}
                  title={`2020: ${s.population.toLocaleString()}`}
                ></div>
              </div>
            )}
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
