export interface DistrictStats {
  id: number;
  population: number;
  efficiencyGap: number;
}

export function runAnalysis(data: { districts: { id: number, population: number }[] }): DistrictStats[] {
  const { districts } = data;
  return districts.map(d => ({
    id: d.id,
    population: d.population,
    efficiencyGap: (Math.random() * 0.2) - 0.1 // Dummy metric
  }));
}
