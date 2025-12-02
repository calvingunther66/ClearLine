import type { WorkerMessage, WorkerResponse, Constraint, PrecinctStats } from '../core/types';
import { runAnalysis, calculateLinearRegression } from '../core/analysis';
import { seedAndGrow, simulatedAnnealing } from '../core/algorithms';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { STATE_APPORTIONMENT } from '../core/Apportionment';

// Worker State
const precinctDistrictMap = new Map<number, number>();
const precinctStatsMap = new Map<number, number[]>(); // [pop, dem, rep, white, black, hispanic]
const precinctSlopesMap = new Map<number, number[]>(); // [popSlope, demSlope, repSlope, whiteSlope, blackSlope, hispanicSlope]
const precinctStateMap = new Map<number, number>();
const precinctCoordsMap = new Map<number, number[]>(); // Store coords for border generation
const precinctHistoryMap = new Map<number, PrecinctStats[]>();

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    let result;
    switch (type) {
      case 'PING':
        result = 'PONG';
        break;
      case 'LOAD_DATA': {
        const { precincts } = payload as { precincts: { id: number, population: number, districtId: number, stateId: number, coords: number[], stats: number[], history?: PrecinctStats[] }[] };
        precincts.forEach(p => {
          precinctDistrictMap.set(p.id, p.districtId);
          precinctStatsMap.set(p.id, p.stats);
          precinctStateMap.set(p.id, p.stateId);
          if (p.coords) {
            precinctCoordsMap.set(p.id, p.coords);
          }
          if (p.history) {
            precinctHistoryMap.set(p.id, p.history);
            
            // Calculate Slopes
            // [pop, dem, rep, white, black, hispanic]
            const slopes: number[] = [];
            const metrics = ['population', 'demVotes', 'repVotes', 'white', 'black', 'hispanic'] as const;
            
            metrics.forEach(metric => {
              const data = p.history!.map(h => ({ x: h.year, y: (h as unknown as Record<string, number>)[metric] }));
              const { slope } = calculateLinearRegression(data);
              slopes.push(slope);
            });
            precinctSlopesMap.set(p.id, slopes);
          }
        });
        result = true;
        break;
      }
      case 'UPDATE_DISTRICT': {
        const { precinctId, newDistrict } = payload as { precinctId: number, newDistrict: number };
        precinctDistrictMap.set(precinctId, newDistrict);
        result = true;
        break;
      }
      case 'AUTO_REDISTRICT': {
        // We ignore the payload districtCount and use the state apportionment
        
        // Group precincts by state
        const statePrecincts = new Map<number, { id: number, districtId: number, population: number, x: number, y: number }[]>();
        
        precinctDistrictMap.forEach((districtId, precinctId) => {
          const stateId = precinctStateMap.get(precinctId);
          if (stateId !== undefined) {
            if (!statePrecincts.has(stateId)) {
              statePrecincts.set(stateId, []);
            }
            
            // Calculate centroid
            let x = 0, y = 0;
            const coords = precinctCoordsMap.get(precinctId);
            if (coords && coords.length > 0) {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (let i = 0; i < coords.length; i += 2) {
                const cx = coords[i];
                const cy = coords[i+1];
                if (cx < minX) minX = cx;
                if (cy < minY) minY = cy;
                if (cx > maxX) maxX = cx;
                if (cy > maxY) maxY = cy;
              }
              x = (minX + maxX) / 2;
              y = (minY + maxY) / 2;
            }

            statePrecincts.get(stateId)?.push({
              id: precinctId,
              districtId,
              population: precinctStatsMap.get(precinctId)?.[0] || 0,
              x,
              y
            });
          }
        });

        const allUpdates: { id: number; districtId: number }[] = [];

        // Run algorithm for each state
        statePrecincts.forEach((precincts, stateId) => {
          const apportionment = STATE_APPORTIONMENT[stateId];
          if (!apportionment) return; // Skip unknown states

          const districtCount = apportionment.districts;
          
          const newAssignment = seedAndGrow(precincts, { districtCount });
          
          newAssignment.forEach((localDistrictId, precinctId) => {
            // Create a unique global district ID: stateId * 100 + localDistrictId
            const globalDistrictId = stateId * 100 + localDistrictId;
            allUpdates.push({ id: precinctId, districtId: globalDistrictId });
            precinctDistrictMap.set(precinctId, globalDistrictId);
          });
        });
        
        result = allUpdates;
        break;
      }
      case 'SIMULATED_ANNEALING': {
        const { constraints, runs: userRuns = 1, isAuto = false } = payload as { constraints: Constraint[], runs?: number, isAuto?: boolean };
        const statePrecincts = new Map<number, { id: number, districtId: number, population: number, x: number, y: number, stats: number[], slopes: number[] }[]>();
        
        precinctDistrictMap.forEach((districtId, precinctId) => {
          const stateId = precinctStateMap.get(precinctId);
          if (stateId !== undefined) {
            if (!statePrecincts.has(stateId)) {
              statePrecincts.set(stateId, []);
            }
            statePrecincts.get(stateId)?.push({
              id: precinctId,
              districtId,
              population: precinctStatsMap.get(precinctId)?.[0] || 0,
              x: 0, 
              y: 0,
              stats: precinctStatsMap.get(precinctId) || [],
              slopes: precinctSlopesMap.get(precinctId) || []
            });
          }
        });

        const allUpdates: { id: number; districtId: number }[] = [];

        // Determine runs
        let runs = userRuns;
        if (isAuto) {
          // Heuristic: Base 100 + 500 per constraint
          runs = 100 + (constraints.length * 500);
        }
        // Cap at 50,000 to prevent browser hang
        runs = Math.min(runs, 50000);

        statePrecincts.forEach((precincts, stateId) => {
          const apportionment = STATE_APPORTIONMENT[stateId];
          if (!apportionment) return;

          const districtCount = apportionment.districts;
          
          let bestAssignment: Map<number, number> | null = null;
          let minCost = Infinity;

          // Ensemble Loop
          for (let i = 0; i < runs; i++) {
            const { assignment, cost } = simulatedAnnealing(precincts, { districtCount, constraints });
            if (cost < minCost) {
              minCost = cost;
              bestAssignment = assignment;
            }
          }
          
          if (bestAssignment) {
            bestAssignment.forEach((localDistrictId, precinctId) => {
              const globalDistrictId = stateId * 100 + localDistrictId;
              allUpdates.push({ id: precinctId, districtId: globalDistrictId });
              precinctDistrictMap.set(precinctId, globalDistrictId);
            });
          }
        });
        
        result = allUpdates;
        break;
      }
      case 'GENERATE_BORDERS': {
        const districts = new Map<number, Feature<Polygon | MultiPolygon>>(); // districtId -> mergedPolygon
        
        // Group precincts by district
        const districtPrecincts = new Map<number, number[]>();
        precinctDistrictMap.forEach((districtId, precinctId) => {
          if (!districtPrecincts.has(districtId)) {
            districtPrecincts.set(districtId, []);
          }
          districtPrecincts.get(districtId)?.push(precinctId);
        });

        // Union polygons for each district
        districtPrecincts.forEach((precinctIds, districtId) => {
          let merged: Feature<Polygon | MultiPolygon> | null = null;
          
          for (const pid of precinctIds) {
            const coords = precinctCoordsMap.get(pid);
            if (!coords || coords.length < 6) continue; // Need at least 3 points (6 numbers)

            // Convert flat coords to GeoJSON polygon ring
            const ring: number[][] = [];
            for (let i = 0; i < coords.length; i += 2) {
              ring.push([coords[i], coords[i+1]]);
            }
            // Ensure closed ring
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) {
              ring.push(ring[0]);
            }

            const poly = turf.polygon([ring]);

            if (!merged) {
              merged = poly;
            } else {
              try {
                merged = turf.union(turf.featureCollection([merged, poly]));
              } catch (e) {
                // Handle union errors (e.g. self-intersection) gracefully
                console.warn(`Union failed for district ${districtId}`, e);
              }
            }
          }
          
          if (merged) {
            // 1. Simplify to remove jagged edges from grid/voronoi union
            const simplified = turf.simplify(merged, { tolerance: 0.5, highQuality: true });
            
            // 2. Smooth with Bezier Spline
            // Helper to smooth a ring (array of coords)
            const smoothRing = (ring: number[][]) => {
              if (ring.length < 3) return ring;
              try {
                const line = turf.lineString(ring);
                const smoothed = turf.bezierSpline(line, { resolution: 10000, sharpness: 0.85 }); // Adjust sharpness as needed
                return smoothed.geometry.coordinates;
              } catch {
                return ring;
              }
            };

            // Apply to Polygon or MultiPolygon
            let smoothedFeature: Feature<Polygon | MultiPolygon> = simplified;
            
            if (simplified.geometry.type === 'Polygon') {
              const poly = simplified.geometry as Polygon;
              const newCoords = poly.coordinates.map(ring => smoothRing(ring));
              smoothedFeature = turf.polygon(newCoords);
            } else if (simplified.geometry.type === 'MultiPolygon') {
              const multi = simplified.geometry as MultiPolygon;
              const newCoords = multi.coordinates.map(poly => poly.map(ring => smoothRing(ring)));
              smoothedFeature = turf.multiPolygon(newCoords);
            }

            districts.set(districtId, smoothedFeature);
          }
        });

        result = Array.from(districts.entries());
        break;
      }
      case 'RUN_ANALYSIS': {
        // Aggregate data from internal state
        const districtStats = new Map<number, {
          population: number,
          demVotes: number,
          repVotes: number,
          white: number,
          black: number,
          hispanic: number,
          educationProduct: number,
          incomeProduct: number
        }>();
        
        const districtHistory = new Map<number, Map<number, PrecinctStats>>(); // districtId -> year -> stats

        precinctDistrictMap.forEach((districtId, precinctId) => {
          const stats = precinctStatsMap.get(precinctId);
          if (!stats) return; // Should have stats

          if (!districtStats.has(districtId)) {
            districtStats.set(districtId, {
              population: 0,
              demVotes: 0,
              repVotes: 0,
              white: 0,
              black: 0,
              hispanic: 0,
              educationProduct: 0,
              incomeProduct: 0
            });
          }
          
          const d = districtStats.get(districtId)!;
          // Stats array: [pop, dem, rep, white, black, hispanic, education, income]
          const pop = stats[0];
          d.population += pop;
          d.demVotes += stats[1];
          d.repVotes += stats[2];
          d.white += stats[3];
          d.black += stats[4];
          d.hispanic += stats[5];
          d.educationProduct += (stats[6] || 0) * pop;
          d.incomeProduct += (stats[7] || 0) * pop;

          // History Aggregation
          const history = precinctHistoryMap.get(precinctId);
          if (history) {
            if (!districtHistory.has(districtId)) {
              districtHistory.set(districtId, new Map());
            }
            const dHist = districtHistory.get(districtId)!;
            history.forEach(h => {
              const current = dHist.get(h.year);
              if (!current) {
                dHist.set(h.year, { ...h }); // Clone initial
              } else {
                // Aggregate
                current.population += h.population;
                current.demVotes += h.demVotes;
                current.repVotes += h.repVotes;
                current.white += h.white;
                current.black += h.black;
                current.hispanic += h.hispanic;
                current.education += h.education; // Sum for now, avg later? No, education is %, so we need weighted avg.
                // Actually, PrecinctStats education/income are raw numbers or %?
                // In MapEngine: education * (1 - yearsBack * 0.01)
                // In types.ts: education: number
                // In DataStore: stats[6] is education.
                // Wait, in MapEngine stats[6] is education.
                // In RUN_ANALYSIS aggregation: d.educationProduct += (stats[6] || 0) * pop;
                // So stats[6] is a rate (0-1 or 0-100).
                // PrecinctStats has education: number.
                // Let's assume PrecinctStats.education is the RATE.
                // To aggregate rates for a district, we need weighted average by population.
                // But here we are just summing them?
                // For simplicity in this "fun" mode, let's just sum the raw counts if we had them.
                // But we don't have raw counts for education/income in PrecinctStats, we have the rate.
                // We should probably store the weighted sum in the map and then divide by total pop at the end.
                // But PrecinctStats structure is fixed.
                // Let's just do a simple average for now or weighted average if we can.
                // We can't easily store the weighted sum in a PrecinctStats object if it expects a rate.
                // Let's cheat slightly and store the weighted sum in 'education' and 'income' properties of the accumulator,
                // and then divide by population when converting to array.
                current.education += h.education * h.population;
                current.income += h.income * h.population;
              }
            });
          }
        });
        
        const districts = Array.from(districtStats.entries()).map(([id, s]) => {
          const dHistMap = districtHistory.get(id);
          const history = dHistMap ? Array.from(dHistMap.entries()).map(([, stats]) => ({
            ...stats,
            education: stats.population > 0 ? stats.education / stats.population : 0,
            income: stats.population > 0 ? stats.income / stats.population : 0
          })).sort((a, b) => a.year - b.year) : [];
          
          return {
            id,
            population: s.population,
            demVotes: s.demVotes,
            repVotes: s.repVotes,
            white: s.white,
            black: s.black,
            hispanic: s.hispanic,
            education: s.population > 0 ? s.educationProduct / s.population : 0,
            income: s.population > 0 ? s.incomeProduct / s.population : 0,
            efficiencyGap: 0, // Calculated in runAnalysis
            history
          };
        });


        // Partisan Swing Simulation
        const projections: { id: number, dem: number, rep: number }[] = [];
        const SWING_FACTOR = 0.15;

        precinctDistrictMap.forEach((districtId, precinctId) => {
          const stats = precinctStatsMap.get(precinctId);
          if (!stats) return;

          const dStats = districtStats.get(districtId);
          if (!dStats || dStats.population === 0) return;

          const dTotal = dStats.demVotes + dStats.repVotes;
          const dDemShare = dTotal > 0 ? dStats.demVotes / dTotal : 0.5;

          const pDem = stats[1];
          const pRep = stats[2];
          const pTotal = pDem + pRep;
          const pDemShare = pTotal > 0 ? pDem / pTotal : 0.5;

          // Swing: Shift precinct lean towards district lean
          const swing = (dDemShare - pDemShare) * SWING_FACTOR;
          const newDemShare = Math.max(0, Math.min(1, pDemShare + swing));
          
          const newDem = Math.round(pTotal * newDemShare);
          const newRep = pTotal - newDem;

          projections.push({ id: precinctId, dem: newDem, rep: newRep });
        });

        const analysis = runAnalysis({ districts });
        result = { analysis, projections };
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    const response: WorkerResponse = {
      id,
      success: true,
      data: result
    };
    self.postMessage(response);

  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: (error as Error).message
    };
    self.postMessage(response);
  }
};
