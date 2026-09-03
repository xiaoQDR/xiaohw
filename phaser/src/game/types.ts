export type Resource =
  | 'wood' | 'fur' | 'meat' | 'bait' | 'leather' | 'curedMeat'
  | 'iron' | 'coal' | 'sulphur' | 'steel' | 'medicine' | 'charm'
  | 'scales' | 'teeth' | 'cloth' | 'torch' | 'bullets' | 'energyCell'
  | 'grenade' | 'bolas' | 'alienAlloy';

export type Building =
  | 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost'
  | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';

export type Job =
  | 'gatherer' | 'hunter' | 'trapper' | 'tanner' | 'charcutier'
  | 'ironMiner' | 'coalMiner' | 'sulphurMiner' | 'steelworker' | 'armourer';

export type ViewName = 'room' | 'village' | 'world' | 'ship' | 'space' | 'ending';
export type ItemType = 'tool' | 'upgrade' | 'weapon' | 'good' | 'special';

export interface LandmarkEventState {
  tile: string;
  key: string;
  name: string;
  danger: number;
  stage: 'intro' | 'reward';
  loot: Partial<Record<Resource, number>>;
}

export interface EnemyState {
  name: string;
  hp: number;
  maxHp: number;
  damage: number;
  nextAttack: number;
  stunnedUntil: number;
  loot: Partial<Record<Resource, number>>;
  landmarkKey?: string;
}

export interface WorldState {
  map: string[][];
  pendingLandmark: LandmarkEventState | null;
  activeEnemy: EnemyState | null;
  loadout: Record<string, number>;
  outfit: Record<string, number>;
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
  trapCooldown: number;
  productionTimer: number;
  population: number;
  nextArrival: number;
  stores: Record<Resource, number>;
  buildings: Record<Building, number>;
  jobs: Record<Job, number>;
  crafted: Record<string, number>;
  builderArrived: boolean;
  worldUnlocked: boolean;
  shipUnlocked: boolean;
  gameWon: boolean;
  score: number;
  totalScore: number;
  ship: {
    hull: number;
    thrusters: number;
    inFlight: boolean;
    flightHull: number;
    altitude: number;
  };
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
  cost: Cost[] | ((owned: number) => Cost[]);
  requires?: Building;
  max?: number;
}

export interface CraftDefinition {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  cost: Cost[];
  max?: number;
  quantity?: number;
  requires?: Building;
}

export interface TradeDefinition {
  id: string;
  name: string;
  type: ItemType;
  cost: Cost[];
  quantity?: number;
  max?: number;
}
