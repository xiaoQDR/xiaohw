export type Resource = 'wood' | 'food' | 'fur' | 'bait' | 'leather' | 'iron' | 'coal' | 'steel' | 'medicine' | 'charm';
export type Building = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';
export type Job = 'gatherer' | 'hunter' | 'trapper' | 'tanner' | 'charcutier' | 'ironMiner' | 'coalMiner' | 'steelworker';
export type ViewName = 'room' | 'village' | 'world';

export interface WorldState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  food: number;
  water: number;
  steps: number;
  active: boolean;
  visited: string[];
  cleared: string[];
}

export interface SaveState {
  version: number;
  startedAt: number;
  lastTick: number;
  fire: number;
  fireSeconds: number;
  gatherCooldown: number;
  population: number;
  nextArrival: number;
  stores: Record<Resource, number>;
  buildings: Record<Building, number>;
  jobs: Record<Job, number>;
  crafted: Record<string, number>;
  builderArrived: boolean;
  worldUnlocked: boolean;
  world: WorldState;
  log: string[];
}

export interface Cost {
  resource: Resource;
  amount: number;
}

export interface BuildDefinition {
  id: Building;
  name: string;
  description: string;
  cost: Cost[];
  requires?: Building;
  max?: number;
}

export interface CraftDefinition {
  id: string;
  name: string;
  description: string;
  cost: Cost[];
  max?: number;
}
