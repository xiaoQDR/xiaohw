import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';

type BuildingDef = {
  id: BuildingId;
  name: string;
  texture: string;
  footprint: [number, number];
  costWood: number;
  displaySize: [number, number];
};

type MenuState = {
  menu: Phaser.GameObjects.Container;
  viewport: Phaser.GameObjects.Container;
  content: Phaser.GameObjects.Container;
  maskShape: Phaser.GameObjects.Graphics;
  left: Phaser.GameObjects.Container;
  right: Phaser.GameObjects.Container;
  cardWidth: number;
  gap: number;
  viewportWidth: number;
  scrollX: number;
  maxScroll: number;
  visibleIds: string;
  dragStartX: number | null;
  contentStartX: number;
};

const DESIGN_W = 1080;
const MENU_H = 430;
const CARD_W = 252;
const CARD_H = 270;
const GAP = 18;
const SIDE_PAD = 78;
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

const stateMap = new WeakMap<BuildScene, MenuState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function placedIds(scene: BuildScene): Set<string> {
  const placed = getPrivate<Array<{ id: string }>>(scene, 'placed') ?? [];
  return new Set(placed.map((b) => b.id));
}

function isUnlocked(scene: BuildScene, id: BuildingId): boolean {
  const built = placedIds(scene);
  if (id === 'trap' || id === 'cart' || id === 'hut') return true;
  if (id === 'lodge') return built.has('hut');
  if (id === 'tradingPost') return built.has('lodge');
  if (id === 'tannery' || id === 'smokehouse') return built.has('lodge');
  if (id === 'workshop') return built.has('tannery') && built.has('smokehouse');
  if (id === 'steelworks') return built.has('workshop');
  if (id === 'armoury') return built.has('steelworks');
  return false;
}

function costLines(def: BuildingDef): string[] {
  const lines = [`木材 ${def.costWood}`];
  const extra: Partial<Record<BuildingId, string>> = {
    lodge: '毛皮 10 · 肉 5',
    tradingPost: '毛皮 100',
    tannery: '毛皮 50',
    smokehouse: '肉 50',
    workshop: '皮革 100 · 鳞片 10',
    steelworks: '铁 100 · 煤 100',
    armoury: '钢 100 · 硫磺 50',
  };
  if (extra[def.id]) lines.push(extra[def.id]!);
  return lines;
}

function updateArrows(state: MenuState): void {
  state.left.setAlpha(state.scrollX < -1 ? 1 : 0.28);
  state.right.setAlpha(state.scrollX > -state.maxScroll + 1 ? 1 : 0.28);
}

function applyScroll(state: MenuState, value: number): void {
  state.scrollX = Phaser.Math.Clamp(value, -state.maxScroll, 0);
  state.content.x = state.scrollX;
  updateArrows(state);
}

function layoutForView(scene: BuildScene, state: MenuState): void {
  const view = scene.cameras.main.worldView;
  const safeWidth = Math.min(DESIGN_W - 28, Math.max(680, view.width - 34));
  state.viewportWidth = safeWidth - SIDE_PAD * 2;
  const viewportX = DESIGN_W / 2 - state.viewportWidth / 2;
  state.viewport.setPosition(viewportX, VIEW_Y);

  state.maskShape.clear().fillStyle(0xffffff, 1).fillRect(
    viewportX,
    VIEW_Y,
    state.viewportWidth,
    CARD_H + 10,
  );
  state.viewport.setMask(state.maskShape.createGeometryMask());

  const cards = state.content.list.length / 5;
  const contentWidth = Math.max(0, cards * state.cardWidth + Math.max(0, cards - 1) * state.gap);
  state.maxScroll = Math.max(0, contentWidth - state.viewportWidth);
  applyScroll(state, state.scrollX);

  state.left.setPosition(viewportX - 36, VIEW_Y + CARD_H / 2);
  state.right.setPosition(viewportX + state.viewportWidth + 36, VIEW_Y + CARD_H / 2);
}

function addArrow(scene: BuildScene, label: string, onPress: () => void): Phaser.GameObjects.Container {
  const bg = scene.add.circle(0, 0, 31, 0x344237, 0.98)
    .setStrokeStyle(2, 0x718669, 1)
    .setInteractive({ useHandCursor: true });
  const text = scene.add.text(0, -2, label, {
    fontFamily: 'system-ui, sans-serif', fontSize: '37px', color: '#fff7df', fontStyle: 'bold',
  }).setOrigin(0.5);
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    onPress();
  });
  return scene.add.container(0, 0, [bg, text]);
}

function rebuildCards(scene: BuildScene, state: MenuState): void {
  const visible = BUILDINGS.filter((def) => isUnlocked(scene, def.id));
  const signature = visible.map((d) => d.id).join('|');
  if (signature === state.visibleIds) return;
  state.visibleIds = signature;
  state.content.removeAll(true);

  visible.forEach((def, index) => {
    const x = index * (CARD_W + GAP);
    const card = scene.add.rectangle(x + CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, 0x354237, 1)
      .setStrokeStyle(2, 0x718669, 1)
      .setInteractive({ draggable: true, useHandCursor: true });
    card.setData('buildingDef', def);

    const icon = scene.add.image(x + CARD_W / 2, 82, def.texture).setDisplaySize(112, 112);
    const name = scene.add.text(x + 18, 144, def.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#fff7df', fontStyle: 'bold',
      wordWrap: { width: CARD_W - 36, useAdvancedWrap: true },
      align: 'center', lineSpacing: 3,
    }).setOrigin(0, 0);
    const cost = scene.add.text(x + 18, 184, costLines(def).join('\n'), {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#d4dfc7',
      wordWrap: { width: CARD_W - 36, useAdvancedWrap: true },
      lineSpacing: 4,
    });
    const footprint = scene.add.text(x + CARD_W - 18, CARD_H - 18, `${def.footprint[0]}×${def.footprint[1]}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#9fba8e', fontStyle: 'bold',
    }).setOrigin(1, 1);
    state.content.add([card, icon, name, cost, footprint]);
  });

  state.scrollX = 0;
  layoutForView(scene, state);
}

function createMenu(scene: BuildScene): MenuState {
  const menu = scene.add.container(0, 0).setDepth(5000);
  const bg = scene.add.rectangle(DESIGN_W / 2, MENU_H / 2, DESIGN_W, MENU_H, 0x202821, 0.985).setInteractive();
  const topLine = scene.add.rectangle(DESIGN_W / 2, 3, DESIGN_W, 6, 0x627653, 1);
  const title = scene.add.text(34, 18, '建造 · 向上拖入场景', {
    fontFamily: 'system-ui, sans-serif', fontSize: '32px', color: '#f2ebd8', fontStyle: 'bold',
  });
  const hint = scene.add.text(DESIGN_W - 34, 27, '左右滑动查看更多', {
    fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#a9b99d',
  }).setOrigin(1, 0);

  const viewport = scene.add.container(0, VIEW_Y);
  const content = scene.add.container(0, 0);
  viewport.add(content);
  const maskShape = scene.add.graphics().setVisible(false);

  const state = {} as MenuState;
  state.menu = menu;
  state.viewport = viewport;
  state.content = content;
  state.maskShape = maskShape;
  state.cardWidth = CARD_W;
  state.gap = GAP;
  state.viewportWidth = DESIGN_W - SIDE_PAD * 2;
  state.scrollX = 0;
  state.maxScroll = 0;
  state.visibleIds = '';
  state.dragStartX = null;
  state.contentStartX = 0;

  const left = addArrow(scene, '‹', () => applyScroll(state, state.scrollX + state.viewportWidth * 0.74));
  const right = addArrow(scene, '›', () => applyScroll(state, state.scrollX - state.viewportWidth * 0.74));
  state.left = left;
  state.right = right;

  const swipe = scene.add.rectangle(DESIGN_W / 2, VIEW_Y + CARD_H / 2, DESIGN_W - 150, CARD_H + 18, 0xffffff, 0.001)
    .setInteractive();
  swipe.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    state.dragStartX = pointer.x;
    state.contentStartX = state.scrollX;
  });
  swipe.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.isDown || state.dragStartX == null) return;
    const dx = (pointer.x - state.dragStartX) / Math.max(0.001, scene.cameras.main.zoom);
    applyScroll(state, state.contentStartX + dx);
  });
  const clearSwipe = () => { state.dragStartX = null; };
  swipe.on('pointerup', clearSwipe);
  swipe.on('pointerout', clearSwipe);

  // Swipe layer sits below cards so cards still receive upward drag-to-build gestures.
  menu.add([bg, topLine, title, hint, swipe, viewport, left, right]);
  setPrivate(scene, 'menu', menu);
  rebuildCards(scene, state);
  layoutForView(scene, state);
  return state;
}

export function installBuildMenuPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__buildMenuPatched) return;
  (proto as Record<string, unknown>).__buildMenuPatched = true;

  proto.createBottomMenu = function patchedCreateBottomMenu(this: BuildScene) {
    stateMap.set(this, createMenu(this));
  };

  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = stateMap.get(this);
    if (state) rebuildCards(this, state);
    return result;
  };

  const originalResize = proto.resizeViewport;
  proto.resizeViewport = function patchedResize(this: BuildScene, ...args: any[]) {
    const result = originalResize.apply(this, args);
    const state = stateMap.get(this);
    if (state) layoutForView(this, state);
    return result;
  };

  const originalPlaceBuilding = proto.placeBuilding;
  proto.placeBuilding = function patchedPlaceBuilding(this: BuildScene, ...args: any[]) {
    const result = originalPlaceBuilding.apply(this, args);
    const state = stateMap.get(this);
    if (state) rebuildCards(this, state);
    return result;
  };
}
