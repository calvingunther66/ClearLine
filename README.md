# ClearLine

**ClearLine** is a high-performance, non-partisan Congressional Redistricting & Analysis Platform. It simulates complex political mapping with extreme data granularity (100k+ polygons) while maintaining 60fps using a custom Web Worker pool and Canvas/WebGL rendering.

## Features

- **High-Performance Rendering:** Custom `MapEngine` using Canvas API for 60fps rendering of 100k+ precincts.
- **Auto-Redistricting:** "Seed & Grow" and "Simulated Annealing" algorithms running in background Web Workers.
- **Real-time Analysis:** Instant calculation of population balance and "Efficiency Gap" metrics.
- **Dynamic Borders:** Geometric union of district polygons performed off-main-thread using Turf.js.
- **Interactive Tools:** Brush tools for manual precinct assignment and map interaction.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

### Building for Production

To build the application for production:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Architecture

- **Frontend:** React, TypeScript, Vite, TailwindCSS
- **Core Engine:** Custom Canvas rendering, Spatial Indexing (RBush)
- **Data Processing:** Web Workers for off-main-thread computation
- **Geospatial:** Turf.js for geometric operations
