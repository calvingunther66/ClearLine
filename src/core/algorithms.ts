import type { Constraint } from './types';

export interface AlgorithmConfig {
  districtCount: number;
  constraints?: Constraint[];
}

export function seedAndGrow(
  precincts: { id: number; districtId: number; population: number; x: number; y: number }[],
  config: AlgorithmConfig
): Map<number, number> {
  const { districtCount } = config;
  const newDistricts = new Map<number, number>();
  
  // 1. Pick Random Seeds as Centers
  const centers: { x: number, y: number, id: number }[] = [];
  const usedSeeds = new Set<number>();
  
  for (let i = 0; i < districtCount; i++) {
    let attempts = 0;
    while (attempts < 100) {
      const randomIdx = Math.floor(Math.random() * precincts.length);
      const p = precincts[randomIdx];
      if (!usedSeeds.has(p.id)) {
        centers.push({ x: p.x, y: p.y, id: i + 1 });
        usedSeeds.add(p.id);
        break;
      }
      attempts++;
    }
  }

  // 2. Assign every precinct to nearest center (Voronoi-like)
  precincts.forEach(p => {
    let minDist = Infinity;
    let closestDistrict = 1;
    
    for (const center of centers) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const distSq = dx*dx + dy*dy;
      if (distSq < minDist) {
        minDist = distSq;
        closestDistrict = center.id;
      }
    }
    newDistricts.set(p.id, closestDistrict);
  });

  return newDistricts;
}

export function simulatedAnnealing(
  precincts: { id: number; districtId: number; population: number; stats?: number[]; slopes?: number[] }[],
  config: AlgorithmConfig
): { assignment: Map<number, number>, cost: number } {
  const { districtCount, constraints = [] } = config;
  
  const currentAssignment = new Map<number, number>();
  // Initialize with current assignment
  precincts.forEach(p => currentAssignment.set(p.id, p.districtId));
  
  // Pre-allocate data structures for cost calculation to avoid GC thrashing
  // We use flat arrays for district stats: [pop, dem, rep, white, black, hispanic, eduProd, incProd] * districtCount
  // And slopes: [pop, dem, rep, white, black, hispanic] * districtCount
  const STATS_STRIDE = 8;
  const SLOPES_STRIDE = 6;
  
  const districtStatsBuffer = new Float64Array((districtCount + 1) * STATS_STRIDE); // +1 for 1-based indexing safety
  const districtSlopesBuffer = new Float64Array((districtCount + 1) * SLOPES_STRIDE);

  // Helper to clear buffers
  const clearBuffers = () => {
    districtStatsBuffer.fill(0);
    districtSlopesBuffer.fill(0);
  };

  // Helper to calculate cost
  const calculateCost = (assignment: Map<number, number>): number => {
    let cost = 0;
    
    // 1. Reset Aggregators
    clearBuffers();
    
    let totalPop = 0;

    // 2. Aggregate Stats (Hot Loop)
    // We iterate precincts and sum up stats into the buffers
    const len = precincts.length;
    for (let i = 0; i < len; i++) {
      const p = precincts[i];
      const dId = assignment.get(p.id)!;
      
      const stats = p.stats || [0,0,0,0,0,0,0,0];
      const slopes = p.slopes || [0,0,0,0,0,0];
      
      const statsOffset = dId * STATS_STRIDE;
      const slopesOffset = dId * SLOPES_STRIDE;
      
      // Unroll for performance
      districtStatsBuffer[statsOffset] += stats[0];     // pop
      districtStatsBuffer[statsOffset + 1] += stats[1]; // dem
      districtStatsBuffer[statsOffset + 2] += stats[2]; // rep
      districtStatsBuffer[statsOffset + 3] += stats[3]; // white
      districtStatsBuffer[statsOffset + 4] += stats[4]; // black
      districtStatsBuffer[statsOffset + 5] += stats[5]; // hispanic
      districtStatsBuffer[statsOffset + 6] += (stats[6] || 0) * stats[0]; // eduProd
      districtStatsBuffer[statsOffset + 7] += (stats[7] || 0) * stats[0]; // incProd
      
      districtSlopesBuffer[slopesOffset] += slopes[0];
      districtSlopesBuffer[slopesOffset + 1] += slopes[1];
      districtSlopesBuffer[slopesOffset + 2] += slopes[2];
      districtSlopesBuffer[slopesOffset + 3] += slopes[3];
      districtSlopesBuffer[slopesOffset + 4] += slopes[4];
      districtSlopesBuffer[slopesOffset + 5] += slopes[5];

      totalPop += stats[0];
    }

    const targetPop = totalPop / districtCount;
    
    // 3. Calculate Cost
    // Population Deviation
    for (let d = 1; d <= districtCount; d++) {
      const pop = districtStatsBuffer[d * STATS_STRIDE];
      if (pop > 0) { // Only count active districts
         cost += Math.abs(pop - targetPop) / targetPop;
      }
    }

    // Constraint Cost
    if (constraints.length > 0) {
      const cLen = constraints.length;
      for (let i = 0; i < cLen; i++) {
        const c = constraints[i];
        let districtsMeeting = 0;
        let totalDistricts = 0;
        
        for (let d = 1; d <= districtCount; d++) {
          const offset = d * STATS_STRIDE;
          const pop = districtStatsBuffer[offset];
          
          if (pop === 0) continue;
          totalDistricts++;
          
          let val = 0;
          
          if (c.metricType === 'growth') {
             const sOffset = d * SLOPES_STRIDE;
             let slope = 0;
             let currentVal = 0;
             
             switch (c.metric) {
               case 'population': slope = districtSlopesBuffer[sOffset]; currentVal = pop; break;
               case 'demVotes': slope = districtSlopesBuffer[sOffset + 1]; currentVal = districtStatsBuffer[offset + 1]; break;
               case 'repVotes': slope = districtSlopesBuffer[sOffset + 2]; currentVal = districtStatsBuffer[offset + 2]; break;
               case 'white': slope = districtSlopesBuffer[sOffset + 3]; currentVal = districtStatsBuffer[offset + 3]; break;
               case 'black': slope = districtSlopesBuffer[sOffset + 4]; currentVal = districtStatsBuffer[offset + 4]; break;
               case 'hispanic': slope = districtSlopesBuffer[sOffset + 5]; currentVal = districtStatsBuffer[offset + 5]; break;
               default: slope = 0; currentVal = 1;
             }
             
             if (currentVal !== 0) {
               val = (slope / currentVal) * 100;
             }
          } else {
             switch (c.metric) {
               case 'population': val = pop; break;
               case 'demVotes': val = districtStatsBuffer[offset + 1]; break;
               case 'repVotes': val = districtStatsBuffer[offset + 2]; break;
               case 'white': val = districtStatsBuffer[offset + 3]; break;
               case 'black': val = districtStatsBuffer[offset + 4]; break;
               case 'hispanic': val = districtStatsBuffer[offset + 5]; break;
               case 'education': val = districtStatsBuffer[offset + 6] / pop; break;
               case 'income': val = districtStatsBuffer[offset + 7] / pop; break;
             }
          }
          
          let meets = false;
          switch (c.operator) {
            case '>': meets = val > c.value; break;
            case '<': meets = val < c.value; break;
            case '>=': meets = val >= c.value; break;
            case '<=': meets = val <= c.value; break;
            case '~=': {
              const tolerance = c.value * 0.05;
              meets = val >= (c.value - tolerance) && val <= (c.value + tolerance);
              break;
            }
            case 'between': {
              const max = c.maxValue ?? c.value;
              meets = val >= c.value && val <= max;
              break;
            }
          }
          
          if (meets) districtsMeeting++;
        }
        
        const percentMet = (districtsMeeting / Math.max(1, totalDistricts)) * 100;
        const deviation = Math.abs(percentMet - c.targetPercent);
        cost += deviation * 10;
      }
    }

    return cost;
  };

  let currentCost = calculateCost(currentAssignment);
  const iterations = 2000;
  let temperature = 1.0;
  const coolingRate = 0.995;

  for (let i = 0; i < iterations; i++) {
    // Pick random precinct
    const randomIdx = Math.floor(Math.random() * precincts.length);
    const p = precincts[randomIdx];
    
    const oldDistrict = currentAssignment.get(p.id)!;
    const newDistrict = Math.floor(Math.random() * districtCount) + 1;
    
    if (newDistrict !== oldDistrict) {
      // Apply move
      currentAssignment.set(p.id, newDistrict);
      const newCost = calculateCost(currentAssignment);
      
      // Acceptance probability
      if (newCost < currentCost) {
        currentCost = newCost;
      } else {
        const prob = Math.exp(-(newCost - currentCost) / temperature);
        if (Math.random() < prob) {
          currentCost = newCost;
        } else {
          // Revert
          currentAssignment.set(p.id, oldDistrict);
        }
      }
    }
    temperature *= coolingRate;
  }
  
  return { assignment: currentAssignment, cost: currentCost };
}
