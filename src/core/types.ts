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
  operator: '>' | '<' | '>=' | '<=';
  value: number;
  targetPercent: number; // % of districts that must meet this rule
}

export interface PrecinctData {
  id: number;
  coords: Float32Array;
  stats: Uint16Array;
  districtId: number;
}
