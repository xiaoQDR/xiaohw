import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

const TILE_W = 132;
const TILE_H = 66;
const EXPANDED_COLS = 13;
const EXPANDED_ROWS = 15;

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function gridToWorld(scene: BuildScene, col: number, row: number): Phaser.Math.Vector2 {
  const fn = (scene as unknown as { gridToWorld?: (c: number, r: number) => Phaser.Math.Vector2 }).gridToWorld;
  return fn ? fn.call(scene, col, row) : new Phaser.Math.Vector2(540, 350);
}

function drawExpandedGrid(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const g = scene.add.graphics();
  g.lineStyle(2, 0x6f8f58, 0.28);
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

function createDenseForest(scene: BuildScene): void {
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  const trees = getPrivate<Phaser.GameObjects.Image[]>(scene, 'forestTrees') ?? [];
  const points: Array<{ c: number; r: number; ox: number; oy: number }> = [];
  const add = (c: number, r: number, ox = 0, oy = 0) => points.push({ c, r, ox, oy });

  for (let c = -4; c <= EXPANDED_COLS + 3; c += 1) {
    add(c, -3, Phaser.Math.Between(-34, 34), Phaser.Math.Between(-24, 24));
    if (c % 2 === 0) add(c, -5, Phaser.Math.Between(-42, 42), Phaser.Math.Between(-28, 28));
    add(c, EXPANDED_ROWS + 2, Phaser.Math.Between(-34, 34), Phaser.Math.Between(-24, 24));
    if (c % 2 !== 0) add(c, EXPANDED_ROWS + 4, Phaser.Math.Between(-42, 42), Phaser.Math.Between(-28, 28));
  }
  for (let r = -2; r <= EXPANDED_ROWS + 2; r += 1) {
    add(-4, r, Phaser.Math.Between(-34, 34), Phaser.Math.Between(-24, 24));
    add(EXPANDED_COLS + 3, r, Phaser.Math.Between(-34, 34), Phaser.Math.Between(-24, 24));
    if (r % 2 === 0) {
      add(-6, r, Phaser.Math.Between(-38, 38), Phaser.Math.Between(-28, 28));
      add(EXPANDED_COLS + 5, r, Phaser.Math.Between(-38, 38), Phaser.Math.Between(-28, 28));
    }
  }

  points.forEach((entry, index) => {
    const p = gridToWorld(scene, entry.c, entry.r);
    const tree = scene.add.image(p.x + entry.ox, p.y - 78 + entry.oy, 'forest-tree')
      .setDisplaySize(146 + (index % 4) * 12, 182 + (index % 4) * 14)
      .setDepth(80 + Math.round((p.y + entry.oy) / 20));
    if (index % 5 === 0) tree.setTint(0xd9e8c7);
    world?.add(tree);
    trees.push(tree);
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
