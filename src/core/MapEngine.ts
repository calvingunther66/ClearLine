import { DataStore } from './DataStore';
import { DataGenerator } from './DataGenerator';
import { BrushManager } from './BrushManager';
import { workerManager } from './WorkerManager';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export class MapEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private transform = { x: 0, y: 0, k: 1 };

  private dataStore: DataStore;
  private animationFrameId: number | null = null;
  private hitCanvas: HTMLCanvasElement;
  private hitCtx: CanvasRenderingContext2D;
  private brushManager: BrushManager;
  private hoveredPrecinctId: number | null = null;
  private districtBorders: Map<number, Feature<Polygon | MultiPolygon>> = new Map();
  private isRunning = false;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
    this.brushManager = new BrushManager(dataStore);
    this.hitCanvas = document.createElement('canvas');
    this.hitCtx = this.hitCanvas.getContext('2d', { willReadFrequently: true })!;

    // Bind methods
    this.render = this.render.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
  }

  public setDistrictBorders(borders: Map<number, Feature<Polygon | MultiPolygon>>) {
    this.districtBorders = borders;
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

  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    
    // Add event listeners
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('mouseleave', this.handleMouseLeave);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    
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
    console.log("Loading initial data...");
    
    try {
      const { features, bounds } = await DataGenerator.loadUSData();
      
      // Calculate transform to fit bounds
      const [minX, minY, maxX, maxY] = bounds;
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

      features.forEach((feature, index) => {
        // Convert GeoJSON polygon to Float32Array
        // We need to flatten the coordinates. 
        // Note: DataStore currently supports simple Polygons. 
        // For MultiPolygons, we might need to simplify or split them.
        // For now, let's take the largest polygon if it's a MultiPolygon, or just the first.
        // Or better, DataStore should handle MultiPolygons? 
        // Current DataStore expects a single Float32Array of coords.
        // Let's flatten all rings into one array separated by NaNs or just take the outer ring of the first polygon for simplicity in this demo.
        // Actually, DataGenerator already projected them to [x,y].
        
        const geometry = feature.geometry;
        let coords: number[] = [];
        
        if (geometry.type === 'Polygon') {
          const poly = geometry as Polygon;
          coords = (poly.coordinates[0] as number[][]).flat();
        } else if (geometry.type === 'MultiPolygon') {
          // Flatten all polygons? Or just take the first?
          // Taking the first is safest for now to avoid rendering artifacts with simple line drawing
          const multiPoly = geometry as MultiPolygon;
          coords = (multiPoly.coordinates[0][0] as number[][]).flat();
        }

        const float32Coords = new Float32Array(coords);
        
        // Stats from feature properties
        const pop = feature.properties?.population || 1000;
        const stats = new Uint16Array([pop, 0, 0]); // Pop, Dem, Rep (dummy)
        
        const stateId = feature.properties?.stateId || 0;
        this.dataStore.addPrecinct(index, float32Coords, stats, 0, stateId);
      });
      
      // Send to worker
      const precinctPayload = Array.from(this.dataStore.getAllPrecincts()).map(p => ({
        id: p.id,
        population: p.stats[0],
        districtId: p.districtId,
        stateId: p.stateId,
        coords: Array.from(p.coords)
      }));
      workerManager.sendMessage('LOAD_DATA', { precincts: precinctPayload });
      
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
        // Color based on district
        const districtColors = ['#1f2937', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
        // Use modulo to cycle colors, but ensure unique-ish colors for adjacent districts (simple modulo is usually enough for this demo)
        // We use districtId % colors.length
        const colorIndex = precinct.districtId % districtColors.length;
        ctx.fillStyle = districtColors[colorIndex] || '#1f2937';
        
        ctx.fill();
        ctx.stroke();
        
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
}
