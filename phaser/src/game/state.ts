import type { Building, Job, Resource, SaveState } from './types';

const SAVE_KEY = 'xiaohw-phaser-save-v1';

const resources = (): Record<Resource, number> => ({
  wood: 0, fur: 0, meat: 0, bait: 0, leather: 0, curedMeat: 0,
  iron: 0, coal: 0, sulphur: 0, steel: 0, medicine: 0, charm: 0,
  scales: 0, teeth: 0, cloth: 0, torch: 0, bullets: 0,
  energyCell: 0, grenade: 0, bolas: 0, alienAlloy: 0,
});

const buildings = (): Record<Building, number> => ({
  trap: 0, cart: 0, hut: 0, lodge: 0, tradingPost: 0,
  tannery: 0, smokehouse: 0, workshop: 0, steelworks: 0, armoury: 0,
});

const jobs = (): Record<Job, number> => ({
  gatherer: 0, hunter: 0, trapper: 0, tanner: 0,
  charcutier: 0, ironMiner: 0, coalMiner: 0, sulphurMiner: 0,
  steelworker: 0, armourer: 0,
});

export function freshState(): SaveState {
  const now = Date.now();
  return {
    version: 2,
    startedAt: now,
    lastTick: now,
    fire: 0,
    fireSeconds: 0,
    gatherCooldown: 0,
    trapCooldown: 0,
    productionTimer: 10,
    population: 0,
    nextArrival: 30,
    stores: resources(),
    buildings: buildings(),
    jobs: jobs(),
    crafted: {},
    builderArrived: false,
    worldUnlocked: false,
    world: { x: 0, y: 0, hp: 10, maxHp: 10, food: 0, water: 0, steps: 0, active: false, visited: ['0,0'], cleared: [] },
    log: ['四周一片漆黑。', '空气冰冷。有人蜷缩在角落里。'],
  };
}

export function loadState(): SaveState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const saved = JSON.parse(raw) as Partial<SaveState> & { stores?: Partial<Record<Resource | 'food', number>> };
    const migratedStores = { ...saved.stores };
    if (typeof migratedStores.food === 'number' && typeof migratedStores.curedMeat !== 'number') {
      migratedStores.curedMeat = migratedStores.food;
    }
    delete migratedStores.food;
    return {
      ...freshState(),
      ...saved,
      version: 2,
      stores: { ...resources(), ...migratedStores },
      buildings: { ...buildings(), ...saved.buildings },
      jobs: { ...jobs(), ...saved.jobs },
      world: { ...freshState().world, ...saved.world },
    };
  } catch {
    return freshState();
  }
}

export function saveState(state: SaveState): void {
  state.lastTick = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(SAVE_KEY);
}
