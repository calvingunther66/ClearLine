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
  precincts: { id: number; districtId: number; population: number; stats?: number[] }[],
  config: AlgorithmConfig
): { assignment: Map<number, number>, cost: number } {
  const { districtCount, constraints = [] } = config;
  
  const currentAssignment = new Map<number, number>();
  // Initialize with current assignment
  precincts.forEach(p => currentAssignment.set(p.id, p.districtId));
  
  // Helper to calculate cost
  const calculateCost = (assignment: Map<number, number>): number => {
    let cost = 0;
    
    // 1. Population Balance Cost (Standard)
    let totalPop = 0;
    
    // 2. Constraint Cost
    // We need to aggregate stats for each district to check constraints
    const districtStats = new Map<number, {
      pop: number,
      dem: number,
      rep: number,
      white: number,
      black: number,
      hispanic: number,
      eduProd: number,
      incProd: number
    }>();

    precincts.forEach(p => {
      const dId = assignment.get(p.id)!;
      if (!districtStats.has(dId)) {
        districtStats.set(dId, { pop: 0, dem: 0, rep: 0, white: 0, black: 0, hispanic: 0, eduProd: 0, incProd: 0 });
      }
      const ds = districtStats.get(dId)!;
      const stats = p.stats || [0,0,0,0,0,0,0,0];
      
      ds.pop += stats[0];
      ds.dem += stats[1];
      ds.rep += stats[2];
      ds.white += stats[3];
      ds.black += stats[4];
      ds.hispanic += stats[5];
      ds.eduProd += (stats[6] || 0) * stats[0];
      ds.incProd += (stats[7] || 0) * stats[0];
      
      totalPop += stats[0];
    });

    const targetPop = totalPop / districtCount;
    
    // Population Deviation Cost
    districtStats.forEach(ds => {
      cost += Math.abs(ds.pop - targetPop) / targetPop;
    });

    // Constraint Cost
    if (constraints.length > 0) {
      constraints.forEach(c => {
        let districtsMeeting = 0;
        let totalDistricts = 0; // Only count districts that exist/have pop
        
        districtStats.forEach(ds => {
          if (ds.pop === 0) return;
          totalDistricts++;
          
          let val = 0;
          switch (c.metric) {
            case 'population': val = ds.pop; break;
            case 'demVotes': val = ds.dem; break;
            case 'repVotes': val = ds.rep; break;
            case 'white': val = ds.white; break;
            case 'black': val = ds.black; break;
            case 'hispanic': val = ds.hispanic; break;
            case 'education': val = ds.eduProd / ds.pop; break;
            case 'income': val = ds.incProd / ds.pop; break;
          }
          
          let meets = false;
          switch (c.operator) {
            case '>': meets = val > c.value; break;
            case '<': meets = val < c.value; break;
            case '>=': meets = val >= c.value; break;
            case '<=': meets = val <= c.value; break;
            case '~=': {
              // Approx match within 5% tolerance
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
        });
        
        const percentMet = (districtsMeeting / Math.max(1, totalDistricts)) * 100;
        const deviation = Math.abs(percentMet - c.targetPercent);
        cost += deviation * 10; // Weight constraints heavily
      });
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
    
    // Propose move to neighbor district? 
    // For simplicity, just random district, but better to pick neighbor.
    // Let's pick a random district for now (simpler than building adjacency graph here).
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
