export interface DistrictStats {
  id: number;
  population: number;
  demVotes: number;
  repVotes: number;
  white: number;
  black: number;
  hispanic: number;
  education: number; // Avg % Bachelors+
  income: number; // Avg Median Household Income
  efficiencyGap: number;
}

export function runAnalysis(data: { districts: Omit<DistrictStats, 'efficiencyGap'>[] }): DistrictStats[] {
  const { districts } = data;
  return districts.map(d => {
    // Calculate Efficiency Gap
    // EG = (Wasted Dem - Wasted Rep) / Total Votes
    const totalVotes = d.demVotes + d.repVotes;
    let eg = 0;
    if (totalVotes > 0) {
      const winThreshold = Math.floor(totalVotes / 2) + 1;
      let wastedDem = 0;
      let wastedRep = 0;
      
      if (d.demVotes > d.repVotes) {
        wastedDem = d.demVotes - winThreshold;
        wastedRep = d.repVotes;
      } else {
        wastedDem = d.demVotes;
        wastedRep = d.repVotes - winThreshold;
      }
      eg = (wastedDem - wastedRep) / totalVotes;
    }

    return {
      ...d,
      efficiencyGap: eg
    };
  });
}
