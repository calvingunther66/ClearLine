export type WorkerMessageType = 'PING' | 'PONG' | 'LOAD_DATA' | 'UPDATE_DISTRICT' | 'RUN_ANALYSIS' | 'AUTO_REDISTRICT' | 'SIMULATED_ANNEALING' | 'GENERATE_BORDERS';

export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload?: unknown;
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Constraint {
  id: string;
  metric: 'population' | 'demVotes' | 'repVotes' | 'white' | 'black' | 'hispanic' | 'education' | 'income';
  metricType?: 'value' | 'growth'; // Default to 'value'
  operator: '>' | '<' | '>=' | '<=' | '~=' | 'between';
  value: number;
  maxValue?: number; // For 'between' operator
  targetPercent: number; // % of districts that must meet this rule
}

export interface PrecinctStats {
  year: number;
  population: number;
  demVotes: number;
  repVotes: number;
  white: number;
  black: number;
  hispanic: number;
  education: number;
  income: number;
}

export interface PrecinctData {
  id: number;
  coords: Float32Array;
  stats: Uint16Array;
  districtId: number;
  countyId?: number;
  projectedDemVotes?: number;
  projectedRepVotes?: number;
  history?: PrecinctStats[];
}
