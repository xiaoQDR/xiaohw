import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type HunterState = {
  busy: WeakSet<Phaser.GameObjects.Image>;
};

const states = new WeakMap<BuildScene, HunterState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function getState(scene: BuildScene): HunterState {
  let state = states.get(scene);
  if (!state) {
    state = { busy: new WeakSet() };
    states.set(scene, state);
  }
  return state;
}

function getLodge(scene: BuildScene): Phaser.GameObjects.Image | undefined {
  const placed = getPrivate<Array<{ id: string; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  return placed.find((building) => building.id === 'lodge')?.sprite;
}

function getForestTarget(scene: BuildScene): Phaser.GameObjects.Image | undefined {
  const trees = (getPrivate<Phaser.GameObjects.Image[]>(scene, 'forestTrees') ?? []).filter((tree) => tree.active);
  return trees.length > 0 ? Phaser.Utils.Array.GetRandom(trees) : undefined;
}

function isHunter(worker: Phaser.GameObjects.Image): boolean {
  return worker.active && worker.getData('job') === 'hunter';
}

function showDelivery(scene: BuildScene, lodge: Phaser.GameObjects.Image, worker: Phaser.GameObjects.Image): void {
  const popup = scene.add.text(worker.x, worker.y - 58, '交付猎物', {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '19px',
    color: '#ffe3a8',
    fontStyle: 'bold',
    stroke: '#4a3627',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({
    targets: popup,
    y: popup.y - 36,
    alpha: 0,
    duration: 850,
    onComplete: () => popup.destroy(),
  });
  scene.tweens.add({
    targets: lodge,
    scaleX: lodge.scaleX * 1.025,
    scaleY: lodge.scaleY * 1.025,
    yoyo: true,
    duration: 100,
  });
}

function startHunterLoop(scene: BuildScene, worker: Phaser.GameObjects.Image): void {
  if (!isHunter(worker)) return;
  const state = getState(scene);
  if (state.busy.has(worker)) return;

  const lodge = getLodge(scene);
  const tree = getForestTarget(scene);
  if (!lodge || !tree) return;

  state.busy.add(worker);
  scene.tweens.killTweensOf(worker);
  worker.clearTint();

  const huntX = tree.x + Phaser.Math.Between(-34, 34);
  const huntY = tree.y + Phaser.Math.Between(42, 72);

  scene.tweens.add({
    targets: worker,
    x: huntX,
    y: huntY,
    duration: Phaser.Math.Between(1700, 2400),
    ease: 'Sine.InOut',
    onComplete: () => {
      if (!isHunter(worker)) {
        state.busy.delete(worker);
        return;
      }
      worker.setTint(0xb8b39b);
      scene.time.delayedCall(1500, () => {
        if (!isHunter(worker)) {
          worker.clearTint();
          state.busy.delete(worker);
          return;
        }
        worker.clearTint();
        const currentLodge = getLodge(scene);
        if (!currentLodge) {
          state.busy.delete(worker);
          return;
        }
        scene.tweens.add({
          targets: worker,
          x: currentLodge.x + Phaser.Math.Between(-54, 54),
          y: currentLodge.y + 58,
          duration: Phaser.Math.Between(1700, 2400),
          ease: 'Sine.InOut',
          onComplete: () => {
            if (!isHunter(worker)) {
              state.busy.delete(worker);
              return;
            }
            showDelivery(scene, currentLodge, worker);
            scene.time.delayedCall(700, () => {
              state.busy.delete(worker);
              if (isHunter(worker)) startHunterLoop(scene, worker);
            });
          },
        });
      });
    },
  });
}

function tickHunters(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const worker of workers) {
    if (isHunter(worker)) startHunterLoop(scene, worker);
  }
}

export function installHunterWorkPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__hunterWorkPatched) return;
  marker.__hunterWorkPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    getState(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tickHunters(this);
    return result;
  };
}
