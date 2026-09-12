import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { getLandmark, getWorldTile, setLastWorldMap, WORLD_RADIUS, WORLD_TILE } from '../game/worldMap';

type AnyExpedition = Phaser.Scene & Record<string, any>;
type WorldSave = { version: 1; map: string[][] | null; visited: string[]; cleared: string[]; savedAt: number };

const SAVE_KEY = 'xiaohw-world-v1';
const TILE = 92;
const VIEW_RADIUS = 4;
let state: WorldSave = loadState();
const visited = new Set<string>(state.visited);
const cleared = new Set<string>(state.cleared);
const restoring = new WeakSet<ExpeditionScene>();
const nextSaveAt = new WeakMap<ExpeditionScene, number>();

function loadState(): WorldSave {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { version: 1, map: null, visited: [], cleared: [], savedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<WorldSave>;
    if (parsed.version !== 1) return { version: 1, map: null, visited: [], cleared: [], savedAt: 0 };
    return {
      version: 1,
      map: validMap(parsed.map) ? parsed.map! : null,
      visited: Array.isArray(parsed.visited) ? parsed.visited.filter((v): v is string => typeof v === 'string') : [],
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((v): v is string => typeof v === 'string') : [],
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    return { version: 1, map: null, visited: [], cleared: [], savedAt: 0 };
  }
}
function validMap(map: unknown): map is string[][] {
  const size = WORLD_RADIUS * 2 + 1;
  return Array.isArray(map) && map.length === size && map.every(row => Array.isArray(row) && row.length === size);
}
function writeState(map?: string[][]): void {
  try {
    if (map && validMap(map)) state.map = map.map(row => [...row]);
    state.visited = [...visited];
    state.cleared = [...cleared];
    state.savedAt = Date.now();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Keep gameplay running when browser storage is unavailable.
  }
}
function parseKey(key: string): { x: number; y: number } | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}
function mineClaimed(scene: AnyExpedition, tile: string): boolean {
  const build = scene.scene.get('build') as Phaser.Scene & Record<string, any>;
  const flags = build.claimedMineTypes ?? {};
  if (tile === WORLD_TILE.ironMine) return Boolean(flags.iron);
  if (tile === WORLD_TILE.coalMine) return Boolean(flags.coal);
  if (tile === WORLD_TILE.sulphurMine) return Boolean(flags.sulphur);
  return true;
}
function effectiveCleared(scene: AnyExpedition, key: string, tile: string): boolean {
  if (!cleared.has(key)) return false;
  const build = scene.scene.get('build') as Phaser.Scene & Record<string, any>;
  if (tile === WORLD_TILE.ship && !build.starshipRecovered) return false;
  if ([WORLD_TILE.ironMine, WORLD_TILE.coalMine, WORLD_TILE.sulphurMine].includes(tile as any) && !mineClaimed(scene, tile)) return false;
  return true;
}
function restoreRevealed(scene: AnyExpedition): void {
  if (visited.size === 0) return;
  const originalX = Number(scene.px ?? 0);
  const originalY = Number(scene.py ?? 0);
  restoring.add(scene as unknown as ExpeditionScene);
  for (const key of visited) {
    const point = parseKey(key);
    if (!point) continue;
    scene.px = point.x;
    scene.py = point.y;
    scene.revealAroundPlayer?.();
  }
  scene.px = originalX;
  scene.py = originalY;
  restoring.delete(scene as unknown as ExpeditionScene);
}
function overlayCleared(scene: AnyExpedition): void {
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
  const map = scene.worldMap as string[][] | undefined;
  if (!map) return;

  for (const key of cleared) {
    const point = parseKey(key);
    if (!point) continue;
    const gx = point.x - px;
    const gy = point.y - py;
    if (Math.abs(gx) > radius || Math.abs(gy) > radius) continue;
    const tile = getWorldTile(map, point.x, point.y);
    if (!tile || !effectiveCleared(scene, key, tile)) continue;
    const sx = centerX + gx * TILE;
    const sy = centerY + gy * TILE;
    layer.add(scene.add.text(sx + 30, sy - 28, '✓', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#dce9bc', fontStyle: 'bold',
      backgroundColor: '#374336', padding: { x: 3, y: 1 },
    }).setOrigin(0.5));
  }
}

export function installExpeditionWorldPersistencePatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__expeditionWorldPersistencePatched) return;
  proto.__expeditionWorldPersistencePatched = true;

  const originalInit = proto.init;
  const originalReveal = proto.revealAroundPlayer;
  const originalWin = proto.winEncounter;
  const originalInspect = proto.inspectCurrentTile;
  const originalRender = proto.renderMap;
  const originalReturn = proto.returnToCamp;

  proto.init = function patchedInit(this: AnyExpedition, ...args: any[]) {
    const result = originalInit.apply(this, args);
    if (validMap(state.map)) {
      this.worldMap = state.map.map(row => [...row]);
      setLastWorldMap(this.worldMap);
    } else if (validMap(this.worldMap)) {
      state.map = this.worldMap.map((row: string[]) => [...row]);
      setLastWorldMap(this.worldMap);
      writeState(this.worldMap);
    }
    restoreRevealed(this);
    nextSaveAt.set(this as unknown as ExpeditionScene, this.time.now + 1500);
    return result;
  };

  proto.revealAroundPlayer = function patchedReveal(this: AnyExpedition) {
    const result = originalReveal.call(this);
    if (!restoring.has(this as unknown as ExpeditionScene)) {
      visited.add(`${Number(this.px ?? 0)},${Number(this.py ?? 0)}`);
      const nextAt = nextSaveAt.get(this as unknown as ExpeditionScene) ?? 0;
      if (this.time.now >= nextAt) {
        writeState(this.worldMap);
        nextSaveAt.set(this as unknown as ExpeditionScene, this.time.now + 1500);
      }
    }
    return result;
  };

  proto.winEncounter = function patchedWin(this: AnyExpedition) {
    const encounter = this.encounter ? { ...this.encounter } : undefined;
    const result = originalWin.call(this);
    if (encounter && parseKey(String(encounter.key ?? '')) && getLandmark(String(encounter.tile ?? ''))) {
      cleared.add(String(encounter.key));
      writeState(this.worldMap);
    }
    return result;
  };

  proto.inspectCurrentTile = function patchedInspect(this: AnyExpedition) {
    const key = `${Number(this.px ?? 0)},${Number(this.py ?? 0)}`;
    const map = this.worldMap as string[][] | undefined;
    const tile = map ? getWorldTile(map, Number(this.px ?? 0), Number(this.py ?? 0)) : undefined;
    const landmark = getLandmark(tile);
    if (tile && landmark && effectiveCleared(this, key, tile)) {
      this.setMessage?.(`${landmark.name}已经清理过了。`);
      return;
    }
    return originalInspect.call(this);
  };

  proto.renderMap = function patchedRender(this: AnyExpedition) {
    const result = originalRender.call(this);
    overlayCleared(this);
    return result;
  };

  proto.returnToCamp = function patchedReturn(this: AnyExpedition, died = false) {
    writeState(this.worldMap);
    return originalReturn.call(this, died);
  };
}
