import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';

type MenuState = {
  trapPurchases: number;
  labels: Partial<Record<BuildingId, Phaser.GameObjects.Text>>;
};

const states = new WeakMap<BuildScene, MenuState>();
const BUILDING_ORDER: BuildingId[] = [
  'trap', 'cart', 'hut', 'lodge', 'tradingPost', 'tannery', 'smokehouse', 'workshop', 'steelworks', 'armoury',
];

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function getState(scene: BuildScene): MenuState {
  let state = states.get(scene);
  if (!state) {
    state = { trapPurchases: 0, labels: {} };
    states.set(scene, state);
  }
  return state;
}

function buildingCount(scene: BuildScene, id: BuildingId): number {
  const placed = getPrivate<Array<{ id: string }>>(scene, 'placed') ?? [];
  return placed.filter((building) => building.id === id).length;
}

function costText(scene: BuildScene, id: BuildingId): string {
  const state = getState(scene);
  switch (id) {
    case 'trap': return `木 ${10 + Math.min(state.trapPurchases, 9) * 10}`;
    case 'hut': return `木 ${100 + buildingCount(scene, 'hut') * 50}`;
    case 'cart': return '木 30';
    case 'lodge': return '木200 毛10 肉5';
    case 'tradingPost': return '木400 毛100';
    case 'tannery': return '木500 毛50';
    case 'smokehouse': return '木600 肉50';
    case 'workshop': return '木800 皮100 鳞10';
    case 'steelworks': return '木1500 铁100 煤100';
    case 'armoury': return '木3000 钢100 硫50';
  }
}

function bindCostLabels(scene: BuildScene): void {
  const menu = getPrivate<Phaser.GameObjects.Container>(scene, 'menu');
  if (!menu) return;
  const costLabels = menu.list.filter((child): child is Phaser.GameObjects.Text =>
    child instanceof Phaser.GameObjects.Text && /^木材\s+\d+/.test(child.text),
  );
  const state = getState(scene);
  BUILDING_ORDER.forEach((id, index) => {
    const label = costLabels[index];
    if (!label) return;
    label.setFontSize(15).setColor('#c8d4ba');
    state.labels[id] = label;
  });
  refreshCostLabels(scene);
}

function refreshCostLabels(scene: BuildScene): void {
  const state = getState(scene);
  for (const id of BUILDING_ORDER) {
    const label = state.labels[id];
    if (!label?.active) continue;
    label.setText(costText(scene, id));
  }
}

export function installDynamicBuildCostPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__dynamicBuildCostPatched) return;
  marker.__dynamicBuildCostPatched = true;

  const originalCreateBottomMenu = proto.createBottomMenu;
  const originalPlaceBuilding = proto.placeBuilding;
  const originalUpdate = proto.update;

  proto.createBottomMenu = function patchedCreateBottomMenu(this: BuildScene, ...args: any[]) {
    const result = originalCreateBottomMenu.apply(this, args);
    bindCostLabels(this);
    return result;
  };

  proto.placeBuilding = function patchedPlaceBuilding(this: BuildScene, ...args: any[]) {
    const def = args[0] as { id?: BuildingId } | undefined;
    const result = originalPlaceBuilding.apply(this, args);
    if (def?.id === 'trap') getState(this).trapPurchases += 1;
    refreshCostLabels(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    refreshCostLabels(this);
    return result;
  };
}
