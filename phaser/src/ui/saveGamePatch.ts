import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyBuild = Phaser.Scene & Record<string, any>;
type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';
type BuildingDef = { id: BuildingId; name: string; texture: string; footprint: [number, number]; costWood: number; displaySize: [number, number] };
type SavedBuilding = { id: BuildingId; col: number; row: number };
type SaveData = {
  version: 1;
  resources: Record<string, number>;
  buildings: SavedBuilding[];
  population: number;
  craftedItems: Record<string, number>;
  claimedMineTypes: { iron: boolean; coal: boolean; sulphur: boolean };
  starshipRecovered: boolean;
  oldStarshipState: { hull: number; engine: number };
  starshipCompleted: boolean;
  savedAt: number;
};

const SAVE_KEY = 'xiaohw-save-v1';
const RESOURCE_KEYS = [
  'wood', 'meat', 'fur', 'bait', 'leather', 'curedMeat', 'scales', 'teeth',
  'cloth', 'charm', 'medicine', 'iron', 'coal', 'sulphur', 'steel', 'bullets', 'torch',
] as const;

const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  trap: { id: 'trap', name: '陷阱', texture: 'building-trap', footprint: [1, 1], costWood: 10, displaySize: [180, 180] },
  cart: { id: 'cart', name: '手推车', texture: 'building-cart', footprint: [1, 1], costWood: 30, displaySize: [190, 190] },
  hut: { id: 'hut', name: '小屋', texture: 'building-hut', footprint: [1, 1], costWood: 100, displaySize: [210, 210] },
  lodge: { id: 'lodge', name: '猎人小屋', texture: 'building-lodge', footprint: [2, 1], costWood: 200, displaySize: [250, 230] },
  tradingPost: { id: 'tradingPost', name: '交易站', texture: 'building-trading-post', footprint: [2, 2], costWood: 400, displaySize: [280, 250] },
  tannery: { id: 'tannery', name: '制革屋', texture: 'building-tannery', footprint: [2, 2], costWood: 500, displaySize: [275, 250] },
  smokehouse: { id: 'smokehouse', name: '熏肉房', texture: 'building-smokehouse', footprint: [2, 2], costWood: 600, displaySize: [275, 250] },
  workshop: { id: 'workshop', name: '工坊', texture: 'building-workshop', footprint: [2, 2], costWood: 800, displaySize: [300, 260] },
  steelworks: { id: 'steelworks', name: '炼钢坊', texture: 'building-steelworks', footprint: [2, 2], costWood: 1500, displaySize: [300, 265] },
  armoury: { id: 'armoury', name: '军械库', texture: 'building-armoury', footprint: [2, 2], costWood: 3000, displaySize: [300, 265] },
};

const saveTimers = new WeakMap<BuildScene, number>();

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}
function readSave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1 || !Array.isArray(parsed.buildings)) return null;
    return parsed as SaveData;
  } catch {
    return null;
  }
}
function makeSave(scene: AnyBuild): SaveData {
  const resources: Record<string, number> = {};
  for (const key of RESOURCE_KEYS) resources[key] = safeNumber(scene[key]);
  const placed = Array.isArray(scene.placed) ? scene.placed : [];
  const buildings: SavedBuilding[] = placed
    .filter((item: any) => item && BUILDING_DEFS[item.id as BuildingId])
    .map((item: any) => ({ id: item.id as BuildingId, col: Number(item.col) || 0, row: Number(item.row) || 0 }));
  const mine = scene.claimedMineTypes ?? {};
  const starship = scene.oldStarshipState ?? {};
  return {
    version: 1,
    resources,
    buildings,
    population: Math.floor(safeNumber(scene.population)),
    craftedItems: { ...(scene.craftedItems ?? {}) },
    claimedMineTypes: { iron: Boolean(mine.iron), coal: Boolean(mine.coal), sulphur: Boolean(mine.sulphur) },
    starshipRecovered: Boolean(scene.starshipRecovered),
    oldStarshipState: {
      hull: Phaser.Math.Clamp(Math.floor(safeNumber(starship.hull)), 0, 3),
      engine: Phaser.Math.Clamp(Math.floor(safeNumber(starship.engine)), 0, 3),
    },
    starshipCompleted: Boolean(scene.starshipCompleted),
    savedAt: Date.now(),
  };
}
function writeSave(scene: AnyBuild): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave(scene)));
  } catch {
    // Storage may be unavailable in private/restricted browser contexts; gameplay continues without blocking.
  }
}
function restoreSave(scene: AnyBuild): void {
  const save = readSave();
  if (!save) return;

  const placeBuilding = scene.placeBuilding as ((def: BuildingDef, col: number, row: number, animate: boolean) => void) | undefined;
  if (placeBuilding) {
    for (const item of save.buildings) {
      const def = BUILDING_DEFS[item.id];
      if (!def) continue;
      placeBuilding.call(scene, def, Math.floor(item.col), Math.floor(item.row), false);
    }
  }

  for (const key of RESOURCE_KEYS) scene[key] = safeNumber(save.resources?.[key]);
  scene.craftedItems = { ...(save.craftedItems ?? {}) };
  scene.claimedMineTypes = {
    iron: Boolean(save.claimedMineTypes?.iron),
    coal: Boolean(save.claimedMineTypes?.coal),
    sulphur: Boolean(save.claimedMineTypes?.sulphur),
  };
  scene.starshipRecovered = Boolean(save.starshipRecovered);
  scene.oldStarshipState = {
    hull: Phaser.Math.Clamp(Math.floor(safeNumber(save.oldStarshipState?.hull)), 0, 3),
    engine: Phaser.Math.Clamp(Math.floor(safeNumber(save.oldStarshipState?.engine)), 0, 3),
  };
  scene.starshipCompleted = Boolean(save.starshipCompleted);
  scene.starshipLaunchUnlocked = scene.oldStarshipState.hull >= 3 && scene.oldStarshipState.engine >= 3;

  const targetPopulation = Math.min(Math.floor(safeNumber(save.population)), Math.floor(safeNumber(scene.populationCap)));
  scene.population = 0;
  const spawnWorker = scene.spawnWorker as (() => void) | undefined;
  for (let i = 0; i < targetPopulation; i += 1) {
    scene.population += 1;
    spawnWorker?.call(scene);
  }
  scene.nextPopulationAt = scene.population < scene.populationCap ? scene.time.now + 8000 : Number.POSITIVE_INFINITY;

  scene.refreshResources?.call(scene);
  scene.refreshBuildMenuNow?.();
  scene.refreshExpeditionInventory?.();
  scene.refreshInventoryPanel?.();
  scene.showToast?.('已恢复本地存档');
}

export function installSaveGamePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, any>;
  if (proto.__saveGamePatched) return;
  proto.__saveGamePatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: AnyBuild, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    restoreSave(this);
    saveTimers.set(this as unknown as BuildScene, this.time.now + 1500);
    const onUnload = () => writeSave(this);
    window.addEventListener('beforeunload', onUnload);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      writeSave(this);
      window.removeEventListener('beforeunload', onUnload);
    });
    return result;
  };

  proto.update = function patchedUpdate(this: AnyBuild, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const scene = this as unknown as BuildScene;
    const nextAt = saveTimers.get(scene) ?? 0;
    if (this.time.now >= nextAt) {
      writeSave(this);
      saveTimers.set(scene, this.time.now + 1500);
    }
    return result;
  };

  proto.saveGameNow = function saveGameNow(this: AnyBuild) { writeSave(this); };
  proto.clearLocalSave = function clearLocalSave(this: AnyBuild) {
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
  };
}
