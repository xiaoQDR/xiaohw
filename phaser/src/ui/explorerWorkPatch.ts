import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ExplorerPhase = 'idle' | 'outbound' | 'exploring' | 'returning' | 'waiting';
type ResourceKey = 'meat' | 'scales' | 'teeth' | 'cloth' | 'charm' | 'iron' | 'coal';

type ExplorerRuntime = {
  phase: ExplorerPhase;
  token: number;
  jobVersion: number;
  retryAt: number;
};

const runtimes = new WeakMap<Phaser.GameObjects.Image, ExplorerRuntime>();
const MEAT_COST = 2;
const EXPLORE_MS = 12_000;

const DROPS: Array<{ under: number; key: Exclude<ResourceKey, 'meat'>; label: string; min: number; max: number }> = [
  { under: 0.30, key: 'teeth', label: '牙齿', min: 1, max: 3 },
  { under: 0.55, key: 'scales', label: '鳞片', min: 1, max: 2 },
  { under: 0.72, key: 'cloth', label: '布料', min: 1, max: 2 },
  { under: 0.84, key: 'iron', label: '铁', min: 1, max: 2 },
  { under: 0.94, key: 'coal', label: '煤', min: 1, max: 2 },
  { under: 1.00, key: 'charm', label: '护符', min: 1, max: 1 },
];

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function getResource(scene: BuildScene, key: ResourceKey): number {
  return Number(getPrivate<number>(scene, key) ?? 0);
}

function setResource(scene: BuildScene, key: ResourceKey, value: number): void {
  (scene as unknown as Record<string, unknown>)[key] = Math.max(0, value);
}

function addResource(scene: BuildScene, key: ResourceKey, amount: number): void {
  setResource(scene, key, getResource(scene, key) + amount);
}

function refresh(scene: BuildScene): void {
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function gridPoint(scene: BuildScene, col: number, row: number): Phaser.Math.Vector2 {
  const fn = (scene as unknown as { gridToWorld?: (c: number, r: number) => Phaser.Math.Vector2 }).gridToWorld;
  return fn ? fn.call(scene, col, row) : new Phaser.Math.Vector2(540, 580);
}

function campPoint(scene: BuildScene): Phaser.Math.Vector2 {
  return gridPoint(scene, 4, 3);
}

function explorerRoad(scene: BuildScene): Phaser.Math.Vector2[] {
  const route = getPrivate<Phaser.Math.Vector2[]>(scene, 'explorerRoadPoints');
  if (route && route.length >= 2) return route.map((p) => new Phaser.Math.Vector2(p.x, p.y));
  return [
    gridPoint(scene, 4.2, 3.4),
    gridPoint(scene, 8.2, 5.2),
    gridPoint(scene, 12.4, 6.2),
    gridPoint(scene, 16.1, 6.8),
    gridPoint(scene, 18.2, 7.1),
  ];
}

function runtimeFor(worker: Phaser.GameObjects.Image): ExplorerRuntime {
  let runtime = runtimes.get(worker);
  if (!runtime) {
    runtime = { phase: 'idle', token: 0, jobVersion: Number(worker.getData('jobVersion') ?? 0), retryAt: 0 };
    runtimes.set(worker, runtime);
  }
  return runtime;
}

function valid(worker: Phaser.GameObjects.Image, runtime: ExplorerRuntime, token: number, version: number): boolean {
  return worker.active && worker.getData('job') === 'explorer' && runtime.token === token && Number(worker.getData('jobVersion') ?? 0) === version;
}

function showResult(scene: BuildScene, worker: Phaser.GameObjects.Image, label: string, amount: number): void {
  const popup = scene.add.text(worker.x, worker.y - 62, `探索归来  +${amount} ${label}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff0b0', fontStyle: 'bold',
    stroke: '#38422d', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({ targets: popup, y: popup.y - 38, alpha: 0, duration: 950, onComplete: () => popup.destroy() });
}

function walkRoute(
  scene: BuildScene,
  worker: Phaser.GameObjects.Image,
  runtime: ExplorerRuntime,
  token: number,
  version: number,
  points: Phaser.Math.Vector2[],
  index: number,
  onComplete: () => void,
): void {
  if (!valid(worker, runtime, token, version)) return;
  if (index >= points.length) {
    onComplete();
    return;
  }
  const target = points[index];
  scene.tweens.add({
    targets: worker,
    x: target.x,
    y: target.y,
    duration: Phaser.Math.Between(1450, 1850),
    ease: 'Sine.InOut',
    onComplete: () => walkRoute(scene, worker, runtime, token, version, points, index + 1, onComplete),
  });
}

function startExpedition(scene: BuildScene, worker: Phaser.GameObjects.Image): void {
  const runtime = runtimeFor(worker);
  const version = Number(worker.getData('jobVersion') ?? 0);
  if (runtime.phase !== 'idle' || scene.time.now < runtime.retryAt) return;

  if (getResource(scene, 'meat') < MEAT_COST) {
    runtime.phase = 'waiting';
    runtime.retryAt = scene.time.now + 2500;
    const camp = campPoint(scene);
    scene.tweens.killTweensOf(worker);
    scene.tweens.add({
      targets: worker,
      x: camp.x + Phaser.Math.Between(-100, 100),
      y: camp.y + Phaser.Math.Between(60, 100),
      duration: 2600,
      ease: 'Sine.InOut',
      onComplete: () => { if (worker.active && worker.getData('job') === 'explorer') runtime.phase = 'idle'; },
    });
    return;
  }

  addResource(scene, 'meat', -MEAT_COST);
  refresh(scene);
  runtime.phase = 'outbound';
  runtime.token += 1;
  runtime.jobVersion = version;
  const token = runtime.token;
  const road = explorerRoad(scene);
  const outbound = road.slice(1);
  const forestDeep = road[road.length - 1];
  scene.tweens.killTweensOf(worker);

  walkRoute(scene, worker, runtime, token, version, outbound, 0, () => {
    if (!valid(worker, runtime, token, version)) return;
    runtime.phase = 'exploring';
    worker.setVisible(false).setPosition(forestDeep.x, forestDeep.y);
    scene.time.delayedCall(EXPLORE_MS, () => {
      if (!valid(worker, runtime, token, version)) return;
      const roll = Math.random();
      const drop = DROPS.find((item) => roll < item.under) ?? DROPS[DROPS.length - 1];
      const amount = Phaser.Math.Between(drop.min, drop.max);
      addResource(scene, drop.key, amount);
      refresh(scene);
      runtime.phase = 'returning';
      worker.setVisible(true).setPosition(forestDeep.x, forestDeep.y);
      const returnRoute = road.slice(0, -1).reverse();
      walkRoute(scene, worker, runtime, token, version, returnRoute, 0, () => {
        if (!valid(worker, runtime, token, version)) return;
        showResult(scene, worker, drop.label, amount);
        runtime.phase = 'idle';
        runtime.retryAt = scene.time.now + 1200;
      });
    });
  });
}

function tick(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const worker of workers) {
    if (!worker.active) continue;
    const runtime = runtimeFor(worker);
    const version = Number(worker.getData('jobVersion') ?? 0);
    if (worker.getData('job') !== 'explorer') {
      if (runtime.phase !== 'idle') {
        runtime.token += 1;
        runtime.phase = 'idle';
        scene.tweens.killTweensOf(worker);
        worker.setVisible(true);
      }
      continue;
    }
    if (runtime.jobVersion !== version) {
      runtime.token += 1;
      runtime.phase = 'idle';
      runtime.jobVersion = version;
      scene.tweens.killTweensOf(worker);
      worker.setVisible(true);
    }
    if (runtime.phase === 'idle') startExpedition(scene, worker);
  }
}

export function installExplorerWorkPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__explorerWorkPatched) return;
  (proto as Record<string, unknown>).__explorerWorkPatched = true;
  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tick(this);
    return result;
  };
}
