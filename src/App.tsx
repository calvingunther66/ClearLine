import { useState, useRef, useEffect } from 'react';
import { MapCanvas } from './components/MapCanvas';
import type { MapCanvasHandle } from './components/MapCanvas';
import { StatsPanel } from './components/StatsPanel';
import { ControlsPanel } from './components/ControlsPanel';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { DataStore } from './core/DataStore';
import { ConstraintsPanel } from './components/ConstraintsPanel';
import type { Constraint } from './core/types';
import type { PrecinctData } from './core/DataStore';

function App() {
  const mapRef = useRef<MapCanvasHandle>(null);
  const [dataStore] = useState(() => new DataStore());
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedPrecinct, setSelectedPrecinct] = useState<PrecinctData | null>(null);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [viewMode, setViewMode] = useState<'district' | 'political'>('district');
  const [isRedistricting, setIsRedistricting] = useState(false);

  useEffect(() => {
    // Initial load
    if (mapRef.current) {
      mapRef.current.loadInitialData();
    }
  }, []);

  const handleAutoRedistrict = async (config: { runs: number; isAuto: boolean }) => {
    if (mapRef.current) {
      setIsRedistricting(true);
      try {
        await mapRef.current.startAutoRedistrict(constraints, config);
        handleUpdate();
      } catch (e) {
        console.error(e);
      } finally {
        setTimeout(() => {
          setIsRedistricting(false);
        }, 0);
      }
    }
  };

  const handleUpdate = () => {
    setUpdateTrigger(prev => prev + 1);
    if (mapRef.current) {
      mapRef.current.render();
    }
  };

  const handleGenerateBorders = () => {
    if (mapRef.current) {
      mapRef.current.generateBorders();
    }
  };

  const handleSetViewMode = (mode: 'district' | 'political') => {
    setViewMode(mode);
    if (mapRef.current) {
      mapRef.current.setViewMode(mode);
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
      <MapCanvas 
        ref={mapRef} 
        dataStore={dataStore} 
        updateTrigger={updateTrigger} 
        onPrecinctSelect={setSelectedPrecinct}
      />
      
      {/* Header / Branding */}
      <div className="absolute top-6 left-6 pointer-events-none select-none z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
              Clear<span className="text-blue-400">Line</span>
            </h1>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                Alpha
              </span>
              <span className="text-xs text-slate-400 font-mono">v0.1.0</span>
            </div>
          </div>
        </div>
      </div>

      <PerformanceMonitor />
      <StatsPanel selectedPrecinct={selectedPrecinct} />
      <ConstraintsPanel constraints={constraints} onConstraintsChange={setConstraints} />
      <ControlsPanel 
        onGenerateBorders={handleGenerateBorders}
        viewMode={viewMode}
        onSetViewMode={handleSetViewMode}
        onAutoRedistrict={handleAutoRedistrict}
        isRedistricting={isRedistricting}
      />
    </div>
  );
}

export default App;
