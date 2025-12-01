import type { WorkerMessage, WorkerResponse } from '../core/types';
import { runAnalysis } from '../core/analysis';
import { seedAndGrow, simulatedAnnealing } from '../core/algorithms';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { STATE_APPORTIONMENT } from '../core/Apportionment';

// Worker State
const precinctDistrictMap = new Map<number, number>();
const precinctStatsMap = new Map<number, number[]>(); // [pop, dem, rep, white, black, hispanic]
const precinctStateMap = new Map<number, number>();
const precinctCoordsMap = new Map<number, number[]>(); // Store coords for border generation

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    let result;
    switch (type) {
      case 'PING':
        result = 'PONG';
        break;
      case 'LOAD_DATA': {
        const { precincts } = payload as { precincts: { id: number, population: number, districtId: number, stateId: number, coords: number[], stats: number[] }[] };
        precincts.forEach(p => {
          precinctDistrictMap.set(p.id, p.districtId);
          precinctStatsMap.set(p.id, p.stats);
          precinctStateMap.set(p.id, p.stateId);
          if (p.coords) {
            precinctCoordsMap.set(p.id, p.coords);
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
        const statePrecincts = new Map<number, { id: number, districtId: number, population: number, x: number, y: number }[]>();
        
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
              x: 0, // Not used for annealing yet
              y: 0
            });
          }
        });

        const allUpdates: { id: number; districtId: number }[] = [];

        statePrecincts.forEach((precincts, stateId) => {
          const apportionment = STATE_APPORTIONMENT[stateId];
          if (!apportionment) return;

          const districtCount = apportionment.districts;
          const newAssignment = simulatedAnnealing(precincts, { districtCount });
          
          newAssignment.forEach((localDistrictId, precinctId) => {
            const globalDistrictId = stateId * 100 + localDistrictId;
            allUpdates.push({ id: precinctId, districtId: globalDistrictId });
            precinctDistrictMap.set(precinctId, globalDistrictId);
          });
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
            districts.set(districtId, merged);
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
        });
        
        const districts = Array.from(districtStats.entries()).map(([id, s]) => ({
          id,
          population: s.population,
          demVotes: s.demVotes,
          repVotes: s.repVotes,
          white: s.white,
          black: s.black,
          hispanic: s.hispanic,
          education: s.population > 0 ? s.educationProduct / s.population : 0,
          income: s.population > 0 ? s.incomeProduct / s.population : 0,
          efficiencyGap: 0 // Calculated in runAnalysis
        }));
        result = runAnalysis({ districts });
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
