import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

const TILE_W = 132;
const TILE_H = 66;
const EXPANDED_COLS = 17;
const EXPANDED_ROWS = 19;
const TAVERN_COL = 8;
const TAVERN_ROW = 9;

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function gridToWorld(scene: BuildScene, col: number, row: number): Phaser.Math.Vector2 {
  const fn = (scene as unknown as { gridToWorld?: (c: number, r: number) => Phaser.Math.Vector2 }).gridToWorld;
  return fn ? fn.call(scene, col, row) : new Phaser.Math.Vector2(540, 350);
}

function drawExpandedGrid(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const g = scene.add.graphics().setDepth(55);
  g.lineStyle(2, 0x6f8f58, 0.25);
  for (let row = 0; row < EXPANDED_ROWS; row += 1) {
    for (let col = 0; col < EXPANDED_COLS; col += 1) {
      const p = gridToWorld(scene, col, row);
      g.strokePoints([
        new Phaser.Math.Vector2(p.x, p.y - TILE_H / 2),
        new Phaser.Math.Vector2(p.x + TILE_W / 2, p.y),
        new Phaser.Math.Vector2(p.x, p.y + TILE_H / 2),
        new Phaser.Math.Vector2(p.x - TILE_W / 2, p.y),
      ], true);
    }
  }
  world?.add(g);
}

function buildExplorerRoad(scene: BuildScene): Phaser.Math.Vector2[] {
  const points = [
    gridToWorld(scene, 8.3, 9.4),
    gridToWorld(scene, 10.2, 8.9),
    gridToWorld(scene, 12.4, 8.2),
    gridToWorld(scene, 14.8, 7.4),
    gridToWorld(scene, 16.5, 7.0),
    gridToWorld(scene, 18.4, 7.1),
    gridToWorld(scene, 20.5, 7.3),
    gridToWorld(scene, 22.4, 7.6),
  ];
  setPrivate(scene, 'explorerRoadPoints', points);
  return points;
}

function drawMainRoad(scene: BuildScene, points: Phaser.Math.Vector2[]): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const road = scene.add.graphics().setDepth(34);
  const edge = scene.add.graphics().setDepth(33);
  edge.lineStyle(104, 0x7f6a4a, 0.44);
  edge.strokePoints(points, false);
  road.lineStyle(82, 0xb69a69, 0.98);
  road.strokePoints(points, false);
  road.lineStyle(56, 0xc8ae78, 0.72);
  road.strokePoints(points, false);
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    road.fillStyle(i % 2 === 0 ? 0x9d835b : 0xd1ba86, 0.44);
    road.fillEllipse(p.x + (i % 2 === 0 ? -20 : 18), p.y + 8, 34, 15);
  }
  world?.add(edge);
  world?.add(road);
}

function distanceToSegment(p: Phaser.Math.Vector2, a: Phaser.Math.Vector2, b: Phaser.Math.Vector2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom <= 0 ? 0 : Phaser.Math.Clamp((apx * abx + apy * aby) / denom, 0, 1);
  return Phaser.Math.Distance.Between(p.x, p.y, a.x + abx * t, a.y + aby * t);
}

function nearRoad(p: Phaser.Math.Vector2, road: Phaser.Math.Vector2[], clearance = 108): boolean {
  for (let i = 0; i < road.length - 1; i += 1) {
    if (distanceToSegment(p, road[i], road[i + 1]) < clearance) return true;
  }
  return false;
}

function insideBuildArea(col: number, row: number): boolean {
  return col >= 0 && col < EXPANDED_COLS && row >= 0 && row < EXPANDED_ROWS;
}

function createDenseForest(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const trees = getPrivate<Phaser.GameObjects.Image[]>(scene, 'forestTrees') ?? [];
  const road = buildExplorerRoad(scene);
  drawMainRoad(scene, road);
  type TreePoint = { c: number; r: number; ox: number; oy: number; scale: number; tint?: number };
  const points: TreePoint[] = [];
  const add = (c: number, r: number, ox = 0, oy = 0, scale = 1, tint?: number) => {
    if (insideBuildArea(c, r)) return;
    const p = gridToWorld(scene, c, r);
    const worldPoint = new Phaser.Math.Vector2(p.x + ox, p.y + oy);
    if (nearRoad(worldPoint, road, 112)) return;
    points.push({ c, r, ox, oy, scale, tint });
  };

  for (let c = -8; c <= EXPANDED_COLS + 12; c += 0.86) {
    for (let r = -8; r <= EXPANDED_ROWS + 10; r += 0.9) {
      if (insideBuildArea(c, r)) continue;
      if ((Math.round(c * 17 + r * 13) % 11) === 0) continue;
      add(c, r, Phaser.Math.Between(-34, 34), Phaser.Math.Between(-26, 26), Phaser.Math.FloatBetween(0.82, 1.16), Math.random() < 0.12 ? 0xd5e5c3 : undefined);
    }
  }

  for (let c = EXPANDED_COLS + 1; c <= EXPANDED_COLS + 12; c += 0.72) {
    for (let r = -3; r <= EXPANDED_ROWS + 6; r += 0.78) {
      if ((Math.round(c * 9 + r * 5) % 4) === 0) continue;
      add(c, r, Phaser.Math.Between(-32, 32), Phaser.Math.Between(-24, 24), Phaser.Math.FloatBetween(0.88, 1.2));
    }
  }

  points.forEach((entry, index) => {
    const p = gridToWorld(scene, entry.c, entry.r);
    const tree = scene.add.image(p.x + entry.ox, p.y - 78 + entry.oy, 'forest-tree')
      .setDisplaySize((146 + (index % 4) * 12) * entry.scale, (182 + (index % 4) * 14) * entry.scale)
      .setDepth(80 + Math.round((p.y + entry.oy) / 20));
    if (entry.tint) tree.setTint(entry.tint);
    world?.add(tree);
    trees.push(tree);
  });
}

function createCentralTavern(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const p = gridToWorld(scene, TAVERN_COL, TAVERN_ROW);
  const tavern = scene.add.image(p.x, p.y - 78, 'central-tavern').setDisplaySize(300, 244).setDepth(340).setInteractive({ useHandCursor: true });
  world?.add(tavern);
  setPrivate(scene, 'treeSprite', tavern);
  ['7,8', '8,8', '7,9', '8,9'].forEach((key) => getPrivate<Set<string>>(scene, 'occupied')?.add(key));

  const badgeBg = scene.add.rectangle(p.x, p.y - 225, 250, 58, 0x253226, 0.94).setStrokeStyle(2, 0x8c7650, 1);
  const status = scene.add.text(p.x, p.y - 225, '', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#f5edd9', fontStyle: 'bold' }).setOrigin(0.5);
  const badge = scene.add.container(0, 0, [badgeBg, status]).setDepth(430);
  world?.add(badge);
  setPrivate(scene, 'treeStatus', status);
  setPrivate(scene, 'treeBadge', badge);
  setPrivate(scene, 'treeReadyAt', scene.time.now + 5000);
  tavern.on('pointerdown', () => (scene as unknown as { collectTreeWood?: () => void }).collectTreeWood?.call(scene));
}

function updateTavernStatus(scene: BuildScene): void {
  const status = getPrivate<Phaser.GameObjects.Text>(scene, 'treeStatus');
  if (!status) return;
  const remaining = Math.max(0, Number(getPrivate<number>(scene, 'treeReadyAt') ?? 0) - scene.time.now);
  const placed = getPrivate<Array<{ id: string }>>(scene, 'placed') ?? [];
  const amount = placed.some((building) => building.id === 'cart') ? 50 : 10;
  if (remaining <= 0) status.setText(`酒馆补给 +${amount}`).setColor('#f5e7a6');
  else status.setText(`酒馆补给 ${Math.ceil(remaining / 1000)}s`).setColor('#d4ddca');
}

export function installWorldExpansionPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__worldExpansionPatched) return;
  (proto as Record<string, unknown>).__worldExpansionPatched = true;
  const originalPreload = proto.preload;
  proto.preload = function patchedPreload(this: BuildScene, ...args: any[]) {
    const result = originalPreload.apply(this, args);
    this.load.svg('central-tavern', 'assets/buildings/tavern.svg', { width: 320, height: 260 });
    return result;
  };
  proto.drawGrid = function patchedDrawGrid(this: BuildScene) { drawExpandedGrid(this); };
  proto.createPerimeterForest = function patchedCreateForest(this: BuildScene) { createDenseForest(this); };
  proto.createHarvestTree = function patchedCreateHarvestTree(this: BuildScene) { createCentralTavern(this); };
  proto.updateTreeStatus = function patchedUpdateTreeStatus(this: BuildScene) { updateTavernStatus(this); };
  proto.canPlace = function patchedCanPlace(this: BuildScene, def: { footprint: [number, number] }, col: number, row: number) {
    if (col < 0 || row < 0 || col + def.footprint[0] > EXPANDED_COLS || row + def.footprint[1] > EXPANDED_ROWS) return false;
    const occupied = getPrivate<Set<string>>(this, 'occupied') ?? new Set<string>();
    for (let y = 0; y < def.footprint[1]; y += 1) for (let x = 0; x < def.footprint[0]; x += 1) if (occupied.has(`${col + x},${row + y}`)) return false;
    return true;
  };
}
