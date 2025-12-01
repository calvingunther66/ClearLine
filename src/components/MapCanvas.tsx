import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { MapEngine } from '../core/MapEngine';
import { DataStore } from '../core/DataStore';

interface MapCanvasProps {
  dataStore: DataStore;
  updateTrigger: number;
}

export interface MapCanvasHandle {
  generateBorders: () => void;
  render: () => void;
  setViewMode: (mode: 'district' | 'political') => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(({ dataStore, updateTrigger }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MapEngine | null>(null);

  useImperativeHandle(ref, () => ({
    generateBorders: () => {
      engineRef.current?.generateBorders();
    },
    render: () => {
      engineRef.current?.render();
    },
    setViewMode: (mode) => {
      engineRef.current?.setViewMode(mode);
    }
  }));

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new MapEngine(dataStore);
      engineRef.current.setCanvas(canvasRef.current);
      engineRef.current.loadInitialData();
      engineRef.current.start();
    }
    
    return () => {
      engineRef.current?.stop();
    };
  }, [dataStore]);

  useEffect(() => {
    // Force re-render when updateTrigger changes
    engineRef.current?.render(); // render is private, but loop handles it.
    // Actually render is private but we can make it public or just rely on loop.
    // But we need to trigger re-render if data changed.
    // MapEngine loop runs at 60fps, so it picks up changes automatically if they are in DataStore.
  }, [updateTrigger]);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
});
