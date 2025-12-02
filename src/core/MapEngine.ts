import { DataStore } from './DataStore';
import type { PrecinctData } from './DataStore';
import { DataGenerator } from './DataGenerator';
import { BrushManager } from './BrushManager';
import { workerManager } from './WorkerManager';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { Constraint } from './types';

export class MapEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private hitCanvas: HTMLCanvasElement | null = null;
  private hitCtx: CanvasRenderingContext2D | null = null;
  private transform = { k: 1, x: 0, y: 0 };

  private dataStore: DataStore;
  private animationFrameId: number | null = null;
  private brushManager: BrushManager;
  private hoveredPrecinctId: number | null = null;
  private districtBorders: Map<number, Feature<Polygon | MultiPolygon>> = new Map();
  private isRunning = false;
  private viewMode: 'district' | 'political' = 'district';
  public onPrecinctSelect: ((data: PrecinctData | null) => void) | null = null;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
    this.brushManager = new BrushManager(dataStore);

    // Bind methods
    this.render = this.render.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  public setDistrictBorders(borders: Map<number, Feature<Polygon | MultiPolygon>>) {
    this.districtBorders = borders;
    this.render();
  }

  public setViewMode(mode: 'district' | 'political') {
    this.viewMode = mode;
    this.render();
  }

  public async generateBorders() {
    try {
      const result = await workerManager.sendMessage('GENERATE_BORDERS', {});
      const borders = new Map(result as [number, Feature<Polygon | MultiPolygon>][]);
      this.setDistrictBorders(borders);
    } catch (e) {
      console.error("Failed to generate borders:", e);
    }
  }
  
  private resize() {
    if (this.canvas && this.hitCanvas) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      this.canvas.width = width;
      this.canvas.height = height;
      
      this.hitCanvas.width = width;
      this.hitCanvas.height = height;
      
      this.render();
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.hitCtx) return;
    
    const rect = this.canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const pixel = this.hitCtx.getImageData(x, y, 1, 1).data;
    const id = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
    
    if (pixel[3] < 255) {
      this.hoveredPrecinctId = null;
    } else {
      this.hoveredPrecinctId = id - 1;
    }

    if (this.hoveredPrecinctId !== null) {
      this.brushManager.handleMouseMove(this.hoveredPrecinctId);
    }
  }

  private handleMouseDown() {
    if (this.hoveredPrecinctId !== null) {
      this.brushManager.handleMouseDown(this.hoveredPrecinctId);
    }
  }

  private handleMouseUp() {
    this.brushManager.handleMouseUp();
  }

  private handleMouseLeave() {
    this.brushManager.handleMouseUp();
    this.hoveredPrecinctId = null;
  }

  private handleClick(e: MouseEvent) {
    const rect = this.canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const id = this.getPrecinctIdAt(x, y);
    if (id !== null) {
      const precinct = this.dataStore.getPrecinct(id);
      if (precinct && this.onPrecinctSelect) {
        this.onPrecinctSelect(precinct);
      }
    } else {
      if (this.onPrecinctSelect) this.onPrecinctSelect(null);
    }
  }

  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    
    this.hitCanvas = document.createElement('canvas');
    this.hitCtx = this.hitCanvas.getContext('2d', { willReadFrequently: true });
    
    // Add event listeners
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.handleMouseLeave);
    canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    canvas.addEventListener('click', this.handleClick);
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = this.transform.k * (1 + delta);
    
    // Zoom towards mouse pointer
    // ... simplified for now
    this.transform.k = Math.max(0.1, Math.min(newScale, 20));
    this.render();
  }

  private idToColor(id: number): string {
    const encodedId = id + 1;
    const r = encodedId & 255;
    const g = (encodedId >> 8) & 255;
    const b = (encodedId >> 16) & 255;
    return `rgb(${r},${g},${b})`;
  }

  private getPrecinctIdAt(x: number, y: number): number | null {
    if (!this.hitCtx) return null;
    const pixel = this.hitCtx.getImageData(x, y, 1, 1).data;
    if (pixel[3] < 255) return null;
    return (pixel[0] + (pixel[1] << 8) + (pixel[2] << 16)) - 1;
  }

  public setZoom(x: number, y: number, k: number) {
    this.transform = { x, y, k };
    this.render();
  }

  public start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private loop() {
    if (!this.isRunning) return;
    this.render();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  public async loadInitialData() {
    try {
      console.log("Loading initial data...");
      const startTime = performance.now();
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Stream data from generator
      const generator = DataGenerator.loadUSDataGenerator();
      
      for await (const { features, bounds } of generator) {
        // Update bounds
        minX = Math.min(minX, bounds[0]);
        minY = Math.min(minY, bounds[1]);
        maxX = Math.max(maxX, bounds[2]);
        maxY = Math.max(maxY, bounds[3]);

        features.forEach((feature) => {
           const id = Number(feature.id);
           
           let coords: number[] = [];
           const geometry = feature.geometry;

           if (geometry.type === 'Polygon') {
             coords = (geometry.coordinates[0] as number[][]).flat();
           } else if (geometry.type === 'MultiPolygon') {
             const multiPoly = geometry as MultiPolygon;
             coords = (multiPoly.coordinates[0][0] as number[][]).flat();
           }

           const float32Coords = new Float32Array(coords);
           
           // Stats from feature properties
           const pop = feature.properties?.population || 1000;
           const dem = feature.properties?.demVotes || 0;
           const rep = feature.properties?.repVotes || 0;
           const white = feature.properties?.white || 0;
           const black = feature.properties?.black || 0;
           const hispanic = feature.properties?.hispanic || 0;
           const education = feature.properties?.education || 0;
           const income = feature.properties?.income || 0;
           
           const stats = new Int32Array([pop, dem, rep, white, black, hispanic, education, income]); 
           
           const stateId = feature.properties?.stateId || 0;
           
           // Simulate History (1980-2015)
           const history = [1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015].map(year => {
             const yearsBack = 2020 - year;
             const growthFactor = 1 - (Math.random() * 0.02 - 0.005) * yearsBack;
             
             return {
               year,
               population: Math.round(pop * growthFactor),
               demVotes: Math.round(dem * growthFactor * (1 + (Math.random() * 0.1 - 0.05))),
               repVotes: Math.round(rep * growthFactor * (1 + (Math.random() * 0.1 - 0.05))),
               white: Math.round(white * growthFactor),
               black: Math.round(black * growthFactor),
               hispanic: Math.round(hispanic * growthFactor * (1 - yearsBack * 0.015)),
               education: education * (1 - yearsBack * 0.01),
               income: income * (1 - yearsBack * 0.02)
             };
           });

           const countyId = feature.properties?.countyId;
           this.dataStore.addPrecinct(id, float32Coords, stats, stateId, stateId, countyId, history);
        });
      }

      // Set transform based on bounds
      const dataWidth = maxX - minX;
      const dataHeight = maxY - minY;
      
      if (this.canvas) {
        const scaleX = this.canvas.width / dataWidth;
        const scaleY = this.canvas.height / dataHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        this.transform = {
          k: scale,
          x: this.canvas.width / 2 - centerX * scale,
          y: this.canvas.height / 2 - centerY * scale
        };
      }

      console.log(`Processed all features in ${performance.now() - startTime}ms. Rendering...`);
      
      // Send to worker in chunks to avoid freezing UI
      const precincts = Array.from(this.dataStore.getAllPrecincts());
      const BATCH_SIZE = 2000;
      
      console.log(`Sending ${precincts.length} precincts to worker in batches of ${BATCH_SIZE}...`);
      
      for (let i = 0; i < precincts.length; i += BATCH_SIZE) {
        const batch = precincts.slice(i, i + BATCH_SIZE).map(p => ({
          id: p.id,
          stats: Array.from(p.stats),
          districtId: p.districtId,
          stateId: p.stateId,
          coords: p.coords, // Send Float32Array directly (Transferable-ish)
          history: p.history
        }));
        
        workerManager.sendMessage('LOAD_DATA', { precincts: batch });
        
        // Yield to main thread
        if (i % (BATCH_SIZE * 2) === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
      console.log("All data sent to worker.");
      
      console.log("All data sent to worker.");
      
      // Auto-redistrict on load to ensure we have correct number of districts (435)
      // and they are contiguous (seedAndGrow).
      console.log("Triggering initial auto-redistrict...");
      await this.startAutoRedistrict([], { runs: 1, isAuto: false });
      
      this.render();
    } catch (e) {
      console.error("Failed to load US data:", e);
    }
  }

  public render() {
    if (!this.ctx || !this.canvas || !this.hitCtx || !this.hitCanvas) return;
    
    const ctx = this.ctx;
    const hitCtx = this.hitCtx;
    const { width, height } = this.canvas;
    const { x, y, k } = this.transform;

    // Clear backgrounds
    ctx.fillStyle = '#1a1a1a'; // Dark bg
    ctx.fillRect(0, 0, width, height);
    
    hitCtx.clearRect(0, 0, width, height); // Transparent bg for hit canvas

    // Setup transforms
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    
    hitCtx.save();
    hitCtx.translate(x, y);
    hitCtx.scale(k, k);

    // Render logic
    ctx.strokeStyle = '#4b5563'; // gray-600
    ctx.lineWidth = 1 / k;
    ctx.fillStyle = '#1f2937'; // gray-800

    // Iterate precincts from DataStore
    for (const precinct of this.dataStore.getAllPrecincts()) {
      const coords = precinct.coords;
      if (coords.length > 0) {
        ctx.beginPath();
        hitCtx.beginPath();
        
        ctx.moveTo(coords[0], coords[1]);
        hitCtx.moveTo(coords[0], coords[1]);
        
        for (let i = 2; i < coords.length; i += 2) {
          ctx.lineTo(coords[i], coords[i+1]);
          hitCtx.lineTo(coords[i], coords[i+1]);
        }
        
        ctx.closePath();
        hitCtx.closePath();
        
        // Draw Main
        if (this.viewMode === 'district') {
          // Color based on district
          const districtColors = [
            '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', 
            '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4',
            '#84cc16', '#d946ef', '#f43f5e', '#eab308', '#2dd4bf'
          ];
          // Use a hash of the districtId to get a stable but pseudo-random color
          // (id * large_prime) % colors.length
          const colorIndex = (precinct.districtId * 137) % districtColors.length;
          ctx.fillStyle = districtColors[colorIndex] || '#1f2937';
        } else {
          // Political View
          // Use projected votes if available, otherwise historical
          const dem = precinct.projectedDemVotes ?? precinct.stats[1];
          const rep = precinct.projectedRepVotes ?? precinct.stats[2];
          const total = dem + rep;
          
          if (total > 0) {
            const demShare = dem / total;
            
            if (demShare > 0.5) {
              // Blue
              const intensity = (demShare - 0.5) * 2; // 0 to 1
              ctx.fillStyle = `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`; // blue-500
            } else {
              // Red
              const intensity = (0.5 - demShare) * 2; // 0 to 1
              ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + intensity * 0.7})`; // red-500
            }
          } else {
            ctx.fillStyle = '#1f2937';
          }
        }
        
        ctx.fill();
        ctx.fill();
        // ctx.stroke(); // Hide precinct borders for cleaner look
        
        // Draw Hit
        hitCtx.fillStyle = this.idToColor(precinct.id);
        hitCtx.fill();
      }
    }

    // Render District Borders
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 / k;
    ctx.lineJoin = 'round';
    
    this.districtBorders.forEach((feature) => {
      ctx.beginPath();
      const geometry = feature.geometry;
      
      const drawRing = (ring: number[][]) => {
        if (ring.length === 0) return;
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(ring[i][0], ring[i][1]);
        }
        ctx.closePath();
      };

      if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach(ring => drawRing(ring));
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(poly => poly.forEach(ring => drawRing(ring)));
      }
      
      ctx.stroke();
    });

    ctx.restore();
    hitCtx.restore();
  }

  public async startAutoRedistrict(constraints: Constraint[] = [], config: { runs: number; isAuto: boolean } = { runs: 1, isAuto: false }) {
    try {
      const messageType = constraints.length > 0 ? 'SIMULATED_ANNEALING' : 'AUTO_REDISTRICT';
      
      const result = await workerManager.sendMessage(messageType, { constraints, runs: config.runs, isAuto: config.isAuto });
      
      const updates = result as { id: number, districtId: number }[];
      updates.forEach(u => {
        const precinct = this.dataStore.getPrecinct(u.id);
        if (precinct) {
          precinct.districtId = u.districtId;
        }
      });
      
    } catch (e) {
      console.error("Auto redistrict failed:", e);
    }
  }

  public async runAnalysis() {
    try {
      const result = await workerManager.sendMessage('RUN_ANALYSIS', {});
      const { projections } = result as { analysis: unknown, projections: { id: number, dem: number, rep: number }[] };
      
      // Update projections in DataStore
      if (projections) {
        projections.forEach(p => {
          const precinct = this.dataStore.getPrecinct(p.id);
          if (precinct) {
            precinct.projectedDemVotes = p.dem;
            precinct.projectedRepVotes = p.rep;
          }
        });
      }
      
      // Trigger re-render to show political swing
      this.render();
      
      // We might want to expose analysis results to the UI via a callback or store
      // For now, we just log it or let the UI pull it if it was stored in DataStore (it's not).
      // The StatsPanel calculates its own stats from the DataStore, so it might need these projections too.
      // Since we updated DataStore, StatsPanel should pick it up if it uses projected votes.
      
    } catch (e) {
      console.error("Analysis failed:", e);
    }
  }
}
