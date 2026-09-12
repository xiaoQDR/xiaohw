import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'meat' | 'fur' | 'bait' | 'leather' | 'curedMeat' | 'scales' | 'teeth' | 'cloth' | 'charm' | 'iron' | 'coal' | 'sulphur' | 'steel' | 'bullets';
type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';

type BalanceState = { nextPopulationAt: number; nextIncomeAt: number; trapBuildCount: number };

const GATHER_CD_MS = 60_000;
const INCOME_TICK_MS = 10_000;
const POP_MIN_MS = 30_000;
const POP_MAX_MS = 180_000;
const states = new WeakMap<BuildScene, BalanceState>();

const EXTRA_COSTS: Partial<Record<BuildingId, Partial<Record<ResourceKey, number>>>> = {
  lodge: { fur: 10, meat: 5 }, tradingPost: { fur: 100 }, tannery: { fur: 50 }, smokehouse: { meat: 50 },
  workshop: { leather: 100, scales: 10 }, steelworks: { iron: 100, coal: 100 }, armoury: { steel: 100, sulphur: 50 },
};
const MAX_COUNTS: Record<BuildingId, number> = { trap: 10, cart: 1, hut: 20, lodge: 1, tradingPost: 1, tannery: 1, smokehouse: 1, workshop: 1, steelworks: 1, armoury: 1 };

function getPrivate<T>(scene: BuildScene, key: string): T | undefined { return (scene as unknown as Record<string, unknown>)[key] as T | undefined; }
function setPrivate(scene: BuildScene, key: string, value: unknown): void { (scene as unknown as Record<string, unknown>)[key] = value; }
function getResource(scene: BuildScene, key: ResourceKey): number { return Number(getPrivate<number>(scene, key) ?? 0); }
function setResource(scene: BuildScene, key: ResourceKey, value: number): void { setPrivate(scene, key, Math.max(0, value)); }
function addResource(scene: BuildScene, key: ResourceKey, amount: number): void { setResource(scene, key, getResource(scene, key) + amount); }
function getState(scene: BuildScene): BalanceState { let state = states.get(scene); if (!state) { state = { nextPopulationAt: Infinity, nextIncomeAt: scene.time.now + INCOME_TICK_MS, trapBuildCount: 0 }; states.set(scene, state); } return state; }
function refresh(scene: BuildScene): void { (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene); }
function showToast(scene: BuildScene, message: string): void { (scene as unknown as { showToast?: (message: string) => void }).showToast?.call(scene, message); }
function currentBuildingCount(scene: BuildScene, id: BuildingId): number { return (getPrivate<Array<{ id: string }>>(scene, 'placed') ?? []).filter((building) => building.id === id).length; }

function originalWoodCost(scene: BuildScene, id: BuildingId): number {
  if (id === 'trap') return 10 + Math.min(getState(scene).trapBuildCount, 9) * 10;
  if (id === 'hut') return 100 + currentBuildingCount(scene, 'hut') * 50;
  const fixed: Record<Exclude<BuildingId, 'trap' | 'hut'>, number> = { cart: 30, lodge: 200, tradingPost: 400, tannery: 500, smokehouse: 600, workshop: 800, steelworks: 1500, armoury: 3000 };
  return fixed[id as Exclude<BuildingId, 'trap' | 'hut'>];
}
function canAffordOriginalCost(scene: BuildScene, id: BuildingId): boolean {
  if (currentBuildingCount(scene, id) >= MAX_COUNTS[id]) return false;
  if (getResource(scene, 'wood') < originalWoodCost(scene, id)) return false;
  const extras = EXTRA_COSTS[id] ?? {};
  return Object.entries(extras).every(([key, amount]) => getResource(scene, key as ResourceKey) >= Number(amount));
}
function payOriginalCostDifference(scene: BuildScene, def: { id: BuildingId; costWood?: number }): void {
  const extraWood = Math.max(0, originalWoodCost(scene, def.id) - Number(def.costWood ?? 0));
  if (extraWood > 0) addResource(scene, 'wood', -extraWood);
  for (const [key, amount] of Object.entries(EXTRA_COSTS[def.id] ?? {})) addResource(scene, key as ResourceKey, -Number(amount));
  if (def.id === 'trap') getState(scene).trapBuildCount += 1;
  refresh(scene);
}
function schedulePopulation(scene: BuildScene): void { getState(scene).nextPopulationAt = scene.time.now + Phaser.Math.Between(POP_MIN_MS, POP_MAX_MS); }
function updatePopulationOriginal(scene: BuildScene): void {
  const state = getState(scene); const population = Number(getPrivate<number>(scene, 'population') ?? 0); const cap = Number(getPrivate<number>(scene, 'populationCap') ?? 0);
  if (population >= cap || cap <= 0) { state.nextPopulationAt = Infinity; return; }
  if (!Number.isFinite(state.nextPopulationAt)) { schedulePopulation(scene); return; }
  if (scene.time.now < state.nextPopulationAt) return;
  const space = cap - population; let amount = Math.floor(Math.random() * (space / 2) + space / 2); if (amount <= 0) amount = 1; amount = Math.min(amount, space);
  const spawn = (scene as unknown as { spawnWorker?: () => void }).spawnWorker;
  for (let i = 0; i < amount; i += 1) { setPrivate(scene, 'population', Number(getPrivate<number>(scene, 'population') ?? 0) + 1); spawn?.call(scene); }
  refresh(scene); showToast(scene, amount === 1 ? '一个流浪者加入了营地' : `${amount} 个流浪者加入了营地`); schedulePopulation(scene);
}
function processJobProduction(scene: BuildScene): void {
  const counts: Record<string, number> = {};
  for (const worker of getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? []) { if (!worker.active) continue; const job = String(worker.getData('job') ?? 'gatherer'); counts[job] = (counts[job] ?? 0) + 1; }
  addResource(scene, 'wood', counts.gatherer ?? 0);
  addResource(scene, 'fur', (counts.hunter ?? 0) * 0.5);
  addResource(scene, 'meat', (counts.hunter ?? 0) * 0.5);
  refresh(scene);
}
function tickIncome(scene: BuildScene): void { const state = getState(scene); if (scene.time.now < state.nextIncomeAt) return; while (scene.time.now >= state.nextIncomeAt) state.nextIncomeAt += INCOME_TICK_MS; processJobProduction(scene); }
function returnGathererWithoutIncome(scene: BuildScene, worker: Phaser.GameObjects.Image): void {
  if (!worker.active || worker.getData('job') !== 'gatherer') return;
  const gridToWorld = (scene as unknown as { gridToWorld?: (col: number, row: number) => Phaser.Math.Vector2 }).gridToWorld;
  const camp = gridToWorld ? gridToWorld.call(scene, 4, 3) : new Phaser.Math.Vector2(540, 580);
  scene.tweens.add({ targets: worker, x: camp.x + Phaser.Math.Between(55, 105), y: camp.y + Phaser.Math.Between(20, 55), angle: 0, duration: Phaser.Math.Between(2400, 3200), ease: 'Sine.InOut', onComplete: () => { if (!worker.active || worker.getData('job') !== 'gatherer') return; (scene as unknown as { startWorkerLoop?: (target: Phaser.GameObjects.Image, delay?: number) => void }).startWorkerLoop?.call(scene, worker, Phaser.Math.Between(650, 1300)); } });
}
function collectWoodOriginal(scene: BuildScene): void {
  const readyAt = Number(getPrivate<number>(scene, 'treeReadyAt') ?? 0); if (scene.time.now < readyAt) return;
  const amount = (getPrivate<Array<{ id: string }>>(scene, 'placed') ?? []).some((building) => building.id === 'cart') ? 50 : 10;
  addResource(scene, 'wood', amount); setPrivate(scene, 'treeReadyAt', scene.time.now + GATHER_CD_MS); refresh(scene);
  const tree = getPrivate<Phaser.GameObjects.Image>(scene, 'treeSprite'); if (tree) { scene.tweens.add({ targets: tree, scaleX: tree.scaleX * 1.03, scaleY: tree.scaleY * 1.03, yoyo: true, duration: 110, ease: 'Sine.Out' }); (scene as unknown as { showWoodPopup?: (x: number, y: number, amount: number) => void }).showWoodPopup?.call(scene, tree.x + 86, tree.y + 70, amount); }
}

export function installOriginalBalancePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>; const marker = proto as unknown as Record<string, unknown>; if (marker.__originalBalancePatched) return; marker.__originalBalancePatched = true;
  const originalCreate = proto.create; const originalUpdate = proto.update; const originalCreateHarvestTree = proto.createHarvestTree; const originalCanPlace = proto.canPlace; const originalPlaceBuilding = proto.placeBuilding;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) { const result = originalCreate.apply(this, args); getState(this).nextIncomeAt = this.time.now + INCOME_TICK_MS; return result; };
  proto.createHarvestTree = function patchedCreateHarvestTree(this: BuildScene, ...args: any[]) { const result = originalCreateHarvestTree.apply(this, args); setPrivate(this, 'treeReadyAt', this.time.now + GATHER_CD_MS); return result; };
  proto.collectTreeWood = function patchedCollectTreeWood(this: BuildScene) { collectWoodOriginal(this); };
  proto.updatePopulation = function patchedUpdatePopulation(this: BuildScene) { updatePopulationOriginal(this); };
  proto.returnWorkerToCamp = function patchedReturnWorkerToCamp(this: BuildScene, worker: Phaser.GameObjects.Image) { returnGathererWithoutIncome(this, worker); };
  proto.canPlace = function patchedCanPlace(this: BuildScene, ...args: any[]) { const base = originalCanPlace.apply(this, args); if (!base) return false; const def = args[0] as { id?: BuildingId } | undefined; if (!def?.id) return base; return canAffordOriginalCost(this, def.id); };
  proto.placeBuilding = function patchedPlaceBuilding(this: BuildScene, ...args: any[]) { const def = args[0] as { id: BuildingId; costWood?: number }; const result = originalPlaceBuilding.apply(this, args); payOriginalCostDifference(this, def); return result; };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) { const result = originalUpdate.apply(this, args); tickIncome(this); return result; };
}
