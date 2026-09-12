import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';
type BuildingDef = { id: BuildingId; name: string; texture: string; footprint: [number, number]; costWood: number; displaySize: [number, number] };
type MenuState = {
  menu: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  topLine: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  viewport: Phaser.GameObjects.Container;
  content: Phaser.GameObjects.Container;
  maskShape: Phaser.GameObjects.Graphics;
  viewportWidth: number;
  scrollX: number;
  maxScroll: number;
  visibleIds: string;
  pointerId: number | null;
  startX: number;
  startY: number;
  contentStartX: number;
  swiping: boolean;
};

const MENU_H = 430;
const CARD_W = 252;
const CARD_H = 270;
const GAP = 18;
const SIDE_PAD = 30;
const VIEW_Y = 92;

const BUILDINGS: BuildingDef[] = [
  { id: 'trap', name: '陷阱', texture: 'building-trap', footprint: [1, 1], costWood: 10, displaySize: [180, 180] },
  { id: 'cart', name: '手推车', texture: 'building-cart', footprint: [1, 1], costWood: 30, displaySize: [190, 190] },
  { id: 'hut', name: '小屋', texture: 'building-hut', footprint: [1, 1], costWood: 100, displaySize: [210, 210] },
  { id: 'lodge', name: '猎人小屋', texture: 'building-lodge', footprint: [2, 1], costWood: 200, displaySize: [250, 230] },
  { id: 'tradingPost', name: '交易站', texture: 'building-trading-post', footprint: [2, 2], costWood: 400, displaySize: [280, 250] },
  { id: 'tannery', name: '制革屋', texture: 'building-tannery', footprint: [2, 2], costWood: 500, displaySize: [275, 250] },
  { id: 'smokehouse', name: '熏肉房', texture: 'building-smokehouse', footprint: [2, 2], costWood: 600, displaySize: [275, 250] },
  { id: 'workshop', name: '工坊', texture: 'building-workshop', footprint: [2, 2], costWood: 800, displaySize: [300, 260] },
  { id: 'steelworks', name: '炼钢坊', texture: 'building-steelworks', footprint: [2, 2], costWood: 1500, displaySize: [300, 265] },
  { id: 'armoury', name: '军械库', texture: 'building-armoury', footprint: [2, 2], costWood: 3000, displaySize: [300, 265] },
];

const MAX_COUNTS: Record<BuildingId, number> = {
  trap: 10,
  cart: 1,
  hut: 20,
  lodge: 1,
  tradingPost: 1,
  tannery: 1,
  smokehouse: 1,
  workshop: 1,
  steelworks: 1,
  armoury: 1,
};

const stateMap = new WeakMap<BuildScene, MenuState>();
function getPrivate<T>(scene: BuildScene, key: string): T | undefined { return (scene as unknown as Record<string, unknown>)[key] as T | undefined; }
function setPrivate(scene: BuildScene, key: string, value: unknown): void { (scene as unknown as Record<string, unknown>)[key] = value; }
function placedList(scene: BuildScene): Array<{ id: string }> { return getPrivate<Array<{ id: string }>>(scene, 'placed') ?? []; }
function placedIds(scene: BuildScene): Set<string> { return new Set(placedList(scene).map((b) => b.id)); }
function buildingCount(scene: BuildScene, id: BuildingId): number { return placedList(scene).filter((b) => b.id === id).length; }
function hasCapacity(scene: BuildScene, id: BuildingId): boolean { return buildingCount(scene, id) < MAX_COUNTS[id]; }
function isUnlocked(scene: BuildScene, id: BuildingId): boolean {
  const built = placedIds(scene);
  if (id === 'trap' || id === 'cart' || id === 'hut') return true;
  if (id === 'lodge') return built.has('hut');
  if (id === 'tradingPost' || id === 'tannery' || id === 'smokehouse') return built.has('lodge');
  if (id === 'workshop') return built.has('tannery') && built.has('smokehouse');
  if (id === 'steelworks') return built.has('workshop');
  if (id === 'armoury') return built.has('steelworks');
  return false;
}
function costLines(def: BuildingDef): string[] {
  const extra: Partial<Record<BuildingId, string>> = {
    lodge: '毛皮 10 · 肉 5', tradingPost: '毛皮 100', tannery: '毛皮 50', smokehouse: '肉 50',
    workshop: '皮革 100 · 鳞片 10', steelworks: '铁 100 · 煤 100', armoury: '钢 100 · 硫磺 50',
  };
  return [`木材 ${def.costWood}`, ...(extra[def.id] ? [extra[def.id]!] : [])];
}
function applyScroll(state: MenuState, value: number): void {
  state.scrollX = Phaser.Math.Clamp(value, -state.maxScroll, 0);
  state.content.x = state.scrollX;
}
function layoutForView(scene: BuildScene, state: MenuState): void {
  const view = scene.cameras.main.worldView;
  const width = view.width;
  state.menu.setPosition(view.left, view.bottom - MENU_H);
  state.bg.setPosition(width / 2, MENU_H / 2).setSize(width, MENU_H);
  state.topLine.setPosition(width / 2, 3).setSize(width, 6);
  state.title.setPosition(30, 18);
  state.hint.setPosition(width - 30, 27);
  state.viewportWidth = Math.max(420, width - SIDE_PAD * 2);
  state.viewport.setPosition(SIDE_PAD, VIEW_Y);
  state.maskShape.clear().fillStyle(0xffffff, 1).fillRect(view.left + SIDE_PAD, view.bottom - MENU_H + VIEW_Y, state.viewportWidth, CARD_H + 12);
  const cardCount = state.content.list.length / 5;
  const contentWidth = Math.max(0, cardCount * CARD_W + Math.max(0, cardCount - 1) * GAP);
  state.maxScroll = Math.max(0, contentWidth - state.viewportWidth);
  applyScroll(state, state.scrollX);
}
function rebuildCards(scene: BuildScene, state: MenuState): void {
  const visible = BUILDINGS.filter((def) => isUnlocked(scene, def.id) && hasCapacity(scene, def.id));
  const signature = visible.map((d) => d.id).join('|');
  if (signature === state.visibleIds) return;
  state.visibleIds = signature;
  state.content.removeAll(true);
  visible.forEach((def, index) => {
    const x = index * (CARD_W + GAP);
    const card = scene.add.rectangle(x + CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, 0x354237, 1)
      .setStrokeStyle(2, 0x718669, 1).setInteractive({ draggable: true, useHandCursor: true });
    card.setData('buildingDef', def);
    const icon = scene.add.image(x + CARD_W / 2, 82, def.texture).setDisplaySize(112, 112);
    const name = scene.add.text(x + 18, 144, def.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#fff7df', fontStyle: 'bold',
      wordWrap: { width: CARD_W - 36, useAdvancedWrap: true }, lineSpacing: 3,
    });
    const cost = scene.add.text(x + 18, 184, costLines(def).join('\n'), {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#d4dfc7',
      wordWrap: { width: CARD_W - 36, useAdvancedWrap: true }, lineSpacing: 4,
    });
    const footprint = scene.add.text(x + CARD_W - 18, CARD_H - 18, `${def.footprint[0]}×${def.footprint[1]}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#9fba8e', fontStyle: 'bold',
    }).setOrigin(1, 1);
    state.content.add([card, icon, name, cost, footprint]);
  });
  state.scrollX = 0;
  layoutForView(scene, state);
}
function cancelBuildDrag(scene: BuildScene): void {
  const preview = getPrivate<Phaser.GameObjects.Image | null>(scene, 'dragPreview');
  const hover = getPrivate<Phaser.GameObjects.Graphics | null>(scene, 'hoverTile');
  preview?.destroy(); hover?.destroy();
  setPrivate(scene, 'dragPreview', null); setPrivate(scene, 'hoverTile', null); setPrivate(scene, 'dragDef', null);
}
function createMenu(scene: BuildScene): MenuState {
  const menu = scene.add.container(0, 0).setDepth(5000);
  const bg = scene.add.rectangle(0, MENU_H / 2, 1, MENU_H, 0x202821, 0.985).setInteractive();
  const topLine = scene.add.rectangle(0, 3, 1, 6, 0x627653, 1);
  const title = scene.add.text(30, 18, '建造 · 上拖建造 / 左右滑动', { fontFamily: 'system-ui, sans-serif', fontSize: '32px', color: '#f2ebd8', fontStyle: 'bold' });
  const hint = scene.add.text(0, 27, '左右滑动查看更多', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#a9b99d' }).setOrigin(1, 0);
  const viewport = scene.add.container(SIDE_PAD, VIEW_Y);
  const content = scene.add.container(0, 0); viewport.add(content);
  const maskShape = scene.add.graphics().setVisible(false);
  const state: MenuState = { menu, bg, topLine, title, hint, viewport, content, maskShape, viewportWidth: 0, scrollX: 0, maxScroll: 0, visibleIds: '', pointerId: null, startX: 0, startY: 0, contentStartX: 0, swiping: false };
  menu.add([bg, topLine, title, hint, viewport]);
  viewport.setMask(maskShape.createGeometryMask());
  setPrivate(scene, 'menu', menu);

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    const wp = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const view = scene.cameras.main.worldView;
    if (wp.y < view.bottom - MENU_H) return;
    state.pointerId = pointer.id; state.startX = pointer.x; state.startY = pointer.y; state.contentStartX = state.scrollX; state.swiping = false;
  });
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.isDown || state.pointerId !== pointer.id) return;
    const dx = pointer.x - state.startX;
    const dy = pointer.y - state.startY;
    if (!state.swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      state.swiping = true;
      cancelBuildDrag(scene);
    }
    if (state.swiping) applyScroll(state, state.contentStartX + dx / Math.max(0.001, scene.cameras.main.zoom));
  });
  const clear = (pointer: Phaser.Input.Pointer) => { if (state.pointerId === pointer.id) { state.pointerId = null; state.swiping = false; } };
  scene.input.on('pointerup', clear);
  scene.input.on('pointerupoutside', clear);

  rebuildCards(scene, state); layoutForView(scene, state);
  return state;
}

export function installBuildMenuPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__buildMenuPatched) return;
  (proto as Record<string, unknown>).__buildMenuPatched = true;
  proto.createBottomMenu = function patchedCreateBottomMenu(this: BuildScene) { stateMap.set(this, createMenu(this)); };
  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = stateMap.get(this); if (state) { rebuildCards(this, state); layoutForView(this, state); }
    return result;
  };
  const originalPlaceBuilding = proto.placeBuilding;
  proto.placeBuilding = function patchedPlaceBuilding(this: BuildScene, ...args: any[]) {
    const result = originalPlaceBuilding.apply(this, args);
    const state = stateMap.get(this); if (state) rebuildCards(this, state);
    return result;
  };
}
