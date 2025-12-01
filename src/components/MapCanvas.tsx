import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { MapEngine } from '../core/MapEngine';
import { DataStore } from '../core/DataStore';
import type { PrecinctData } from '../core/DataStore';

import type { Constraint } from '../core/types';

interface MapCanvasProps {
  dataStore: DataStore;
  updateTrigger: number;
  onPrecinctSelect?: (data: PrecinctData | null) => void;
}

export interface MapCanvasHandle {
  render: () => void;
  generateBorders: () => void;
  setViewMode: (mode: 'district' | 'political') => void;
  loadInitialData: () => Promise<void>;
  startAutoRedistrict: (constraints?: Constraint[], config?: { runs: number; isAuto: boolean }) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(({ dataStore, updateTrigger, onPrecinctSelect }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MapEngine | null>(null);

  useImperativeHandle(ref, () => ({
    render: () => engineRef.current?.render(),
    generateBorders: () => engineRef.current?.generateBorders(),
    setViewMode: (mode) => engineRef.current?.setViewMode(mode),
    loadInitialData: async () => engineRef.current?.loadInitialData(),
    startAutoRedistrict: (constraints, config) => engineRef.current?.startAutoRedistrict(constraints, config)
  }));

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new MapEngine(dataStore);
      engineRef.current.setCanvas(canvasRef.current);
      engineRef.current.loadInitialData();
      engineRef.current.start();
    }
    
    if (engineRef.current) {
      engineRef.current.onPrecinctSelect = onPrecinctSelect || null;
    }
    
    return () => {
      engineRef.current?.stop();
    };
  }, [dataStore, onPrecinctSelect]);

  useEffect(() => {
    // Force re-render when updateTrigger changes
    engineRef.current?.render(); // render is private, but loop handles it.
    // Actually render is private but we can make it public or just rely on loop.
    // But we need to trigger re-render if data changed.
    // MapEngine loop runs at 60fps, so it picks up changes automatically if they are in DataStore.
  }, [updateTrigger]);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
});
