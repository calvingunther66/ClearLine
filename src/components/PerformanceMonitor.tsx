import React, { useEffect, useState } from 'react';

export const PerformanceMonitor: React.FC = () => {
  const [fps, setFps] = useState(0);
  const [memory, setMemory] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = () => {
      const now = performance.now();
      frameCount++;

      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;

        // Check memory if available (Chrome only)
        const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
        if (perf.memory) {
          const mem = perf.memory;
          setMemory({
            used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
            limit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
          });
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="absolute top-6 right-6 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-3 rounded-xl shadow-2xl text-[10px] font-mono text-emerald-400 pointer-events-none select-none z-50 min-w-[140px]">
      <div className="flex justify-between gap-4 mb-1.5 items-center">
        <span className="text-slate-500 font-bold uppercase tracking-wider">FPS</span>
        <span className={`font-bold text-sm ${fps < 30 ? 'text-red-400' : 'text-emerald-400'}`}>{fps}</span>
      </div>
      {memory && (
        <div className="flex justify-between gap-4 mb-1.5 items-center">
          <span className="text-slate-500 font-bold uppercase tracking-wider">MEM</span>
          <span className="text-slate-300">{memory.used} <span className="text-slate-600">/</span> {memory.limit} MB</span>
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-slate-700/50">
        <div className="flex justify-between gap-4 items-center">
          <span className="text-slate-500 font-bold uppercase tracking-wider">Workers</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-blue-400 font-bold">4 Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
