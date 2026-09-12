import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { getLandmark, getWorldTile, WORLD_TILE } from '../game/worldMap';

type AnyExpedition = Phaser.Scene & Record<string, any>;

const TILE = 92;
const VIEW_RADIUS = 4;
const SAVE_KEY = 'xiaohw-outposts-v1';
const persistentOutposts = new Set<string>();
const persistentRoads = new Set<string>(['0,0']);
const usedByExpedition = new WeakMap<ExpeditionScene, Set<string>>();
let loaded = false;

function loadState(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { outposts?: unknown; roads?: unknown };
    if (Array.isArray(parsed.outposts)) for (const key of parsed.outposts) if (typeof key === 'string') persistentOutposts.add(key);
    if (Array.isArray(parsed.roads)) for (const key of parsed.roads) if (typeof key === 'string') persistentRoads.add(key);
  } catch {
    // Ignore malformed/unavailable local storage.
  }
}
function saveState(): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ outposts: [...persistentOutposts], roads: [...persistentRoads] }));
  } catch {
    // Gameplay remains available without persistence.
  }
}
function parseKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}
function makeRoadTo(x: number, y: number): void {
  let cx = 0;
  let cy = 0;
  persistentRoads.add('0,0');
  const stepX = Math.sign(x);
  const stepY = Math.sign(y);
  while (cx !== x) {
    cx += stepX;
    persistentRoads.add(`${cx},${cy}`);
  }
  while (cy !== y) {
    cy += stepY;
    persistentRoads.add(`${cx},${cy}`);
  }
}
function isOutpostEligible(tile: string): boolean {
  const excluded = new Set<string>([
    WORLD_TILE.ironMine,
    WORLD_TILE.coalMine,
    WORLD_TILE.sulphurMine,
    WORLD_TILE.ship,
    WORLD_TILE.executioner,
  ]);
  return Boolean(getLandmark(tile)) && !excluded.has(tile);
}
function markOutpost(scene: AnyExpedition, key: string): void {
  loadState();
  if (persistentOutposts.has(key)) return;
  persistentOutposts.add(key);
  const { x, y } = parseKey(key);
  makeRoadTo(x, y);
  saveState();
  scene.setMessage?.('地点已经清理并建立前哨站。道路已连接回营地，之后经过道路不会触发随机遭遇。');
}
function useOutpost(scene: AnyExpedition, key: string): boolean {
  loadState();
  if (!persistentOutposts.has(key)) return false;
  const expedition = scene as unknown as ExpeditionScene;
  let used = usedByExpedition.get(expedition);
  if (!used) {
    used = new Set<string>();
    usedByExpedition.set(expedition, used);
  }
  if (used.has(key)) {
    scene.setMessage?.('这个前哨站本次远征已经补给过了。');
    return true;
  }
  used.add(key);
  const maxWater = Math.max(0, Number(scene.maxWater ?? 0));
  scene.water = maxWater;
  if (scene.supplies) scene.supplies.curedMeat = Math.max(0, Number(scene.supplies.curedMeat ?? 0)) + 2;
  scene.refreshHud?.();
  scene.setMessage?.('前哨站补给：水已补满，熏肉 +2。每个前哨站每次远征只能补给一次。');
  return true;
}
function maybeRandomEncounter(scene: AnyExpedition): void {
  loadState();
  if (scene.encounter) return;
  const x = Number(scene.px ?? 0);
  const y = Number(scene.py ?? 0);
  const key = `${x},${y}`;
  if (persistentRoads.has(key) || persistentOutposts.has(key) || key === '0,0') return;
  const worldMap = scene.worldMap as string[][] | undefined;
  if (!worldMap) return;
  const tile = getWorldTile(worldMap, x, y);
  if (getLandmark(tile)) return;
  const distance = Math.abs(x) + Math.abs(y);
  const chance = Phaser.Math.Clamp(0.07 + distance * 0.004, 0.07, 0.18);
  if (Math.random() >= chance) return;
  const danger = Math.max(4, Math.ceil(3 + distance * 0.55));
  const terrainName = tile === WORLD_TILE.forest ? '林间袭击' : tile === WORLD_TILE.field ? '荒野袭击' : '废土袭击';
  scene.startEncounter?.(`random:${scene.steps}:${key}`, String(tile ?? ''), terrainName, danger);
}
function overlayRoads(scene: AnyExpedition): void {
  loadState();
  const layer = scene.mapLayer as Phaser.GameObjects.Container | undefined;
  if (!layer) return;
  const width = scene.scale.width;
  const height = scene.scale.height;
  const usableTop = 150;
  const usableBottom = height - 290;
  const centerX = width / 2;
  const centerY = (usableTop + usableBottom) / 2;
  const radius = Math.min(VIEW_RADIUS, Math.max(2, Math.floor(Math.min(width / TILE, (usableBottom - usableTop) / TILE) / 2)));
  const px = Number(scene.px ?? 0);
  const py = Number(scene.py ?? 0);

  for (const key of persistentRoads) {
    const { x, y } = parseKey(key);
    const gx = x - px;
    const gy = y - py;
    if (Math.abs(gx) > radius || Math.abs(gy) > radius) continue;
    if (gx === 0 && gy === 0) continue;
    const sx = centerX + gx * TILE;
    const sy = centerY + gy * TILE;
    layer.add(scene.add.circle(sx, sy + 25, 5, 0xc7b17a, 0.92).setStrokeStyle(1, 0x564a34, 1));
  }
  for (const key of persistentOutposts) {
    const { x, y } = parseKey(key);
    const gx = x - px;
    const gy = y - py;
    if (Math.abs(gx) > radius || Math.abs(gy) > radius) continue;
    const sx = centerX + gx * TILE;
    const sy = centerY + gy * TILE;
    layer.add(scene.add.text(sx, sy + 28, '前哨', {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffe0a6', fontStyle: 'bold', backgroundColor: '#394036', padding: { x: 3, y: 1 },
    }).setOrigin(0.5));
  }
}

export function installExpeditionOutpostPatch(): void {
  loadState();
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__expeditionOutpostPatched) return;
  proto.__expeditionOutpostPatched = true;

  const originalInit = proto.init;
  const originalWinEncounter = proto.winEncounter;
  const originalInspect = proto.inspectCurrentTile;
  const originalRenderMap = proto.renderMap;

  proto.init = function patchedInit(this: AnyExpedition, ...args: any[]) {
    const result = originalInit.apply(this, args);
    usedByExpedition.set(this as unknown as ExpeditionScene, new Set());
    return result;
  };

  proto.winEncounter = function patchedWinEncounter(this: AnyExpedition) {
    const encounter = this.encounter ? { ...this.encounter } : undefined;
    originalWinEncounter.call(this);
    if (!encounter || !isOutpostEligible(String(encounter.tile ?? ''))) return;
    markOutpost(this, String(encounter.key));
    this.renderMap?.();
  };

  proto.inspectCurrentTile = function patchedInspect(this: AnyExpedition) {
    const key = `${Number(this.px ?? 0)},${Number(this.py ?? 0)}`;
    if (useOutpost(this, key)) return;
    originalInspect.call(this);
    if (!this.encounter) maybeRandomEncounter(this);
  };

  proto.renderMap = function patchedRenderMap(this: AnyExpedition) {
    const result = originalRenderMap.call(this);
    overlayRoads(this);
    return result;
  };
}
