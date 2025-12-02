import type { PrecinctStats } from './types';

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
  history?: PrecinctStats[];
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

export function calculateLinearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = data[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R2
  const ssTot = sumYY - (sumY * sumY) / n;

  // More accurate R2 calculation:
  let ssRes2 = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = data[i];
    const yPred = slope * x + intercept;
    ssRes2 += (y - yPred) * (y - yPred);
  }
  const r2 = 1 - (ssRes2 / ssTot);

  return { slope, intercept, r2 };
}

export function projectValue(x: number, slope: number, intercept: number): number {
  return slope * x + intercept;
}
