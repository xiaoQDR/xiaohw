import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

const TILE_W = 132;
const TILE_H = 66;
const EXPANDED_COLS = 13;
const EXPANDED_ROWS = 15;
const HARVEST_COL = 14.1;
const HARVEST_ROW = 10.2;

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
    gridToWorld(scene, 4.2, 3.4),
    gridToWorld(scene, 6.0, 4.5),
    gridToWorld(scene, 8.2, 5.2),
    gridToWorld(scene, 10.4, 5.8),
    gridToWorld(scene, 12.4, 6.2),
    gridToWorld(scene, 14.2, 6.5),
    gridToWorld(scene, 16.1, 6.8),
    gridToWorld(scene, 18.2, 7.1),
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
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  return Phaser.Math.Distance.Between(p.x, p.y, x, y);
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

  const harvestPoint = gridToWorld(scene, HARVEST_COL, HARVEST_ROW);
  type TreePoint = { c: number; r: number; ox: number; oy: number; scale: number; tint?: number };
  const points: TreePoint[] = [];

  const add = (c: number, r: number, ox = 0, oy = 0, scale = 1, tint?: number) => {
    // Hard rule: no forest tree may enter the 13 x 15 buildable rectangle.
    if (insideBuildArea(c, r)) return;
    const p = gridToWorld(scene, c, r);
    const worldPoint = new Phaser.Math.Vector2(p.x + ox, p.y + oy);
    if (nearRoad(worldPoint, road, 112)) return;
    if (Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, harvestPoint.x, harvestPoint.y) < 180) return;
    points.push({ c, r, ox, oy, scale, tint });
  };

  // Fill the whole world outside the settlement with jungle, instead of drawing a perimeter ring.
  for (let c = -8; c <= EXPANDED_COLS + 11; c += 0.86) {
    for (let r = -8; r <= EXPANDED_ROWS + 9; r += 0.9) {
      if (insideBuildArea(c, r)) continue;
      // Small gaps keep the forest organic while still reading as continuous jungle.
      if ((Math.round(c * 17 + r * 13) % 11) === 0) continue;
      add(
        c,
        r,
        Phaser.Math.Between(-34, 34),
        Phaser.Math.Between(-26, 26),
        Phaser.Math.FloatBetween(0.82, 1.16),
        Math.random() < 0.12 ? 0xd5e5c3 : undefined,
      );
    }
  }

  // Extra density in the deep eastern forest where explorers disappear.
  for (let c = EXPANDED_COLS + 1; c <= EXPANDED_COLS + 11; c += 0.72) {
    for (let r = -3; r <= EXPANDED_ROWS + 5; r += 0.78) {
      if ((Math.round(c * 9 + r * 5) % 4) === 0) continue;
      add(
        c,
        r,
        Phaser.Math.Between(-32, 32),
        Phaser.Math.Between(-24, 24),
        Phaser.Math.FloatBetween(0.88, 1.2),
      );
    }
  }

  points.forEach((entry, index) => {
    const p = gridToWorld(scene, entry.c, entry.r);
    const w = (146 + (index % 4) * 12) * entry.scale;
    const h = (182 + (index % 4) * 14) * entry.scale;
    const tree = scene.add.image(p.x + entry.ox, p.y - 78 + entry.oy, 'forest-tree')
      .setDisplaySize(w, h)
      .setDepth(80 + Math.round((p.y + entry.oy) / 20));
    if (entry.tint) tree.setTint(entry.tint);
    world?.add(tree);
    trees.push(tree);
  });
}

function createHarvestTreeOutside(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const p = gridToWorld(scene, HARVEST_COL, HARVEST_ROW);
  const tree = scene.add.image(p.x, p.y - 122, 'harvest-tree')
    .setDisplaySize(420, 380)
    .setDepth(315)
    .setInteractive({ useHandCursor: true });
  world?.add(tree);
  setPrivate(scene, 'treeSprite', tree);

  const badgeBg = scene.add.rectangle(p.x + 8, p.y - 338, 250, 58, 0x253226, 0.9)
    .setStrokeStyle(2, 0x78906a, 1);
  const treeStatus = scene.add.text(p.x + 8, p.y - 338, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#f5edd9', fontStyle: 'bold',
  }).setOrigin(0.5);
  const treeBadge = scene.add.container(0, 0, [badgeBg, treeStatus]).setDepth(430);
  world?.add(treeBadge);

  setPrivate(scene, 'treeStatus', treeStatus);
  setPrivate(scene, 'treeBadge', treeBadge);
  setPrivate(scene, 'treeReadyAt', scene.time.now + 5000);

  tree.on('pointerdown', () => {
    const collect = (scene as unknown as { collectTreeWood?: () => void }).collectTreeWood;
    collect?.call(scene);
  });
}

export function installWorldExpansionPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__worldExpansionPatched) return;
  (proto as Record<string, unknown>).__worldExpansionPatched = true;

  proto.drawGrid = function patchedDrawGrid(this: BuildScene) {
    drawExpandedGrid(this);
  };

  proto.createPerimeterForest = function patchedCreateForest(this: BuildScene) {
    createDenseForest(this);
  };

  proto.createHarvestTree = function patchedCreateHarvestTree(this: BuildScene) {
    createHarvestTreeOutside(this);
  };

  proto.canPlace = function patchedCanPlace(this: BuildScene, def: { footprint: [number, number] }, col: number, row: number) {
    if (col < 0 || row < 0 || col + def.footprint[0] > EXPANDED_COLS || row + def.footprint[1] > EXPANDED_ROWS) return false;
    const occupied = getPrivate<Set<string>>(this, 'occupied') ?? new Set<string>();
    for (let y = 0; y < def.footprint[1]; y += 1) {
      for (let x = 0; x < def.footprint[0]; x += 1) {
        if (occupied.has(`${col + x},${row + y}`)) return false;
      }
    }
    return true;
  };
}
