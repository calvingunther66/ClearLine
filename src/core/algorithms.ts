export interface AlgorithmConfig {
  districtCount: number;
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
  // This is a simple 1-pass assignment. For better results, we could iterate (K-Means).
  // Let's do 1-pass for speed first.
  
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
