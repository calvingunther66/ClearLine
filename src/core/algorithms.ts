export interface AlgorithmConfig {
  districtCount: number;
}

export function seedAndGrow(
  precincts: { id: number; districtId: number; population: number }[],
  config: AlgorithmConfig
): Map<number, number> {
  const { districtCount } = config;
  const newDistricts = new Map<number, number>();
  const unassigned = new Set(precincts.map(p => p.id));
  
  // 1. Seed
  const seeds: number[] = [];
  for (let i = 0; i < districtCount; i++) {
    if (unassigned.size === 0) break;
    const randomIdx = Math.floor(Math.random() * unassigned.size);
    const precinctId = Array.from(unassigned)[randomIdx];
    seeds.push(precinctId);
    newDistricts.set(precinctId, i + 1); // 1-based district IDs
    unassigned.delete(precinctId);
  }

  // 2. Grow (Simplified: Random assignment to nearest neighbor would be better, 
  // but for now just random assignment to remaining)
  // In a real implementation, we need adjacency graph.
  // Since we don't have adjacency graph built yet in the worker, 
  // we will simulate "growth" by just assigning remaining precincts to random districts for now
  // to prove the worker pipeline works. 
  // TODO: Build adjacency graph in DataStore/Worker for real spatial growth.
  
  unassigned.forEach(pid => {
    const randomDistrict = Math.floor(Math.random() * districtCount) + 1;
    newDistricts.set(pid, randomDistrict);
  });

  return newDistricts;
}

export function simulatedAnnealing(
  precincts: { id: number; districtId: number; population: number }[],
  config: AlgorithmConfig
): Map<number, number> {
  // Simplified Simulated Annealing
  // 1. Start with current assignment
  // 2. Iteratively swap/move precincts
  // 3. Accept if better or with probability based on temperature
  
  const currentAssignment = new Map<number, number>();
  precincts.forEach(p => currentAssignment.set(p.id, p.districtId));
  
  const iterations = 1000;
  const { districtCount } = config;

  for (let i = 0; i < iterations; i++) {
    // Pick a random precinct
    const randomIdx = Math.floor(Math.random() * precincts.length);
    const precinct = precincts[randomIdx];
    
    // Propose new district
    const newDistrict = Math.floor(Math.random() * districtCount) + 1;
    
    if (newDistrict !== precinct.districtId) {
      // Calculate "Energy" (Cost) - e.g., population deviation
      // For now, just random acceptance to simulate the process
      if (Math.random() > 0.5) {
        currentAssignment.set(precinct.id, newDistrict);
      }
    }
  }
  
  return currentAssignment;
}
