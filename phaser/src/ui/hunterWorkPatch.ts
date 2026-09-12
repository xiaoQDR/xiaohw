import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type HunterPhase = 'idle' | 'toHunt' | 'hunting' | 'returning' | 'delivering';

type HunterRuntime = {
  phase: HunterPhase;
  token: number;
  jobVersion: number;
};

type HunterState = {
  workers: WeakMap<Phaser.GameObjects.Image, HunterRuntime>;
  zone?: Phaser.GameObjects.Container;
  huntPoints: Phaser.Math.Vector2[];
};

const states = new WeakMap<BuildScene, HunterState>();
const HUNTER_TINT = 0x8f6a42;
const HUNTING_TINT = 0x6f593c;

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function getState(scene: BuildScene): HunterState {
  let state = states.get(scene);
  if (!state) {
    state = { workers: new WeakMap(), huntPoints: [] };
    states.set(scene, state);
  }
  return state;
}

function getLodge(scene: BuildScene): Phaser.GameObjects.Image | undefined {
  const placed = getPrivate<Array<{ id: string; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  return placed.find((building) => building.id === 'lodge')?.sprite;
}

function gridPoint(scene: BuildScene, col: number, row: number): Phaser.Math.Vector2 {
  const fn = (scene as unknown as { gridToWorld?: (col: number, row: number) => Phaser.Math.Vector2 }).gridToWorld;
  return fn ? fn.call(scene, col, row) : new Phaser.Math.Vector2(1080, 420);
}

function createHuntingGround(scene: BuildScene): void {
  const state = getState(scene);
  if (state.zone) return;

  // Outside the expanded build rectangle (0..12 x 0..14), inside the east forest belt.
  const center = gridPoint(scene, 15.2, 4.2);

  const ground = scene.add.graphics();
  ground.fillStyle(0x60784b, 0.95);
  ground.fillEllipse(center.x, center.y + 24, 330, 190);
  ground.lineStyle(5, 0x435637, 0.95);
  ground.strokeEllipse(center.x, center.y + 24, 330, 190);

  const inner = scene.add.graphics();
  inner.fillStyle(0x79965c, 0.9);
  inner.fillEllipse(center.x - 52, center.y + 10, 112, 62);
  inner.fillEllipse(center.x + 70, center.y + 46, 104, 58);
  inner.fillStyle(0x4f663f, 0.95);
  inner.fillCircle(center.x - 112, center.y + 34, 28);
  inner.fillCircle(center.x + 116, center.y - 12, 31);

  const signPost = scene.add.rectangle(center.x, center.y - 88, 10, 72, 0x6c4d33, 1);
  const signBg = scene.add.rectangle(center.x, center.y - 126, 196, 52, 0x38462f, 0.98).setStrokeStyle(2, 0xa4b984, 1);
  const sign = scene.add.text(center.x, center.y - 127, '林间狩猎区', {
    fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff0cc', fontStyle: 'bold',
  }).setOrigin(0.5);

  const zone = scene.add.container(0, 0, [ground, inner, signPost, signBg, sign]).setDepth(132);
  getPrivate<Phaser.GameObjects.Container>(scene, 'world')?.add(zone);
  state.zone = zone;
  state.huntPoints = [
    new Phaser.Math.Vector2(center.x - 105, center.y + 24),
    new Phaser.Math.Vector2(center.x - 28, center.y + 68),
    new Phaser.Math.Vector2(center.x + 48, center.y + 12),
    new Phaser.Math.Vector2(center.x + 112, center.y + 58),
  ];
}

function isHunter(worker: Phaser.GameObjects.Image): boolean {
  return worker.active && worker.getData('job') === 'hunter';
}

function currentJobVersion(worker: Phaser.GameObjects.Image): number {
  return Number(worker.getData('jobVersion') ?? 0);
}

function getRuntime(scene: BuildScene, worker: Phaser.GameObjects.Image): HunterRuntime {
  const state = getState(scene);
  let runtime = state.workers.get(worker);
  if (!runtime) {
    runtime = { phase: 'idle', token: 0, jobVersion: currentJobVersion(worker) };
    state.workers.set(worker, runtime);
  }
  return runtime;
}

function resetRuntime(scene: BuildScene, worker: Phaser.GameObjects.Image, clearTint: boolean): HunterRuntime {
  const runtime = getRuntime(scene, worker);
  runtime.token += 1;
  runtime.phase = 'idle';
  runtime.jobVersion = currentJobVersion(worker);
  scene.tweens.killTweensOf(worker);
  if (clearTint && worker.active) worker.clearTint();
  return runtime;
}

function stillValid(worker: Phaser.GameObjects.Image, runtime: HunterRuntime, token: number, version: number): boolean {
  return isHunter(worker) && runtime.token === token && runtime.jobVersion === version && currentJobVersion(worker) === version;
}

function showDelivery(scene: BuildScene, lodge: Phaser.GameObjects.Image, worker: Phaser.GameObjects.Image): void {
  const popup = scene.add.text(worker.x, worker.y - 58, '猎人交付', {
    fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#ffe3a8', fontStyle: 'bold', stroke: '#4a3627', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({ targets: popup, y: popup.y - 36, alpha: 0, duration: 850, onComplete: () => popup.destroy() });
  scene.tweens.add({ targets: lodge, scaleX: lodge.scaleX * 1.025, scaleY: lodge.scaleY * 1.025, yoyo: true, duration: 100 });
}

function startHunterLoop(scene: BuildScene, worker: Phaser.GameObjects.Image): void {
  if (!isHunter(worker)) return;
  const state = getState(scene);
  const runtime = getRuntime(scene, worker);
  const version = currentJobVersion(worker);
  if (runtime.jobVersion !== version) resetRuntime(scene, worker, false);
  if (runtime.phase !== 'idle') return;

  const lodge = getLodge(scene);
  if (!lodge || state.huntPoints.length === 0) return;

  runtime.phase = 'toHunt';
  runtime.token += 1;
  runtime.jobVersion = version;
  const token = runtime.token;
  worker.setTint(HUNTER_TINT);

  const point = Phaser.Utils.Array.GetRandom(state.huntPoints);
  scene.tweens.add({
    targets: worker,
    x: point.x + Phaser.Math.Between(-24, 24),
    y: point.y + Phaser.Math.Between(-16, 22),
    duration: Phaser.Math.Between(1900, 2700),
    ease: 'Sine.InOut',
    onComplete: () => {
      if (!stillValid(worker, runtime, token, version)) return;
      runtime.phase = 'hunting';
      worker.setTint(HUNTING_TINT);
      scene.time.delayedCall(1500, () => {
        if (!stillValid(worker, runtime, token, version)) return;
        const currentLodge = getLodge(scene);
        if (!currentLodge) { runtime.phase = 'idle'; return; }
        runtime.phase = 'returning';
        worker.setTint(HUNTER_TINT);
        scene.tweens.add({
          targets: worker,
          x: currentLodge.x + Phaser.Math.Between(-50, 50),
          y: currentLodge.y + 58,
          duration: Phaser.Math.Between(1900, 2700),
          ease: 'Sine.InOut',
          onComplete: () => {
            if (!stillValid(worker, runtime, token, version)) return;
            runtime.phase = 'delivering';
            showDelivery(scene, currentLodge, worker);
            scene.time.delayedCall(650, () => {
              if (!stillValid(worker, runtime, token, version)) return;
              runtime.phase = 'idle';
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
    if (!worker.active) continue;
    const runtime = getRuntime(scene, worker);
    const version = currentJobVersion(worker);
    if (runtime.jobVersion !== version) resetRuntime(scene, worker, !isHunter(worker));
    if (isHunter(worker)) {
      if (runtime.phase === 'idle') startHunterLoop(scene, worker);
    } else if (runtime.phase !== 'idle') {
      resetRuntime(scene, worker, true);
    }
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
    createHuntingGround(this);
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tickHunters(this);
    return result;
  };
}
