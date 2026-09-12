import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type MineJob = 'ironMiner' | 'coalMiner' | 'sulphurMiner';
type ResourceKey = 'iron' | 'coal' | 'sulphur';
type Runtime = { job: MineJob | null; version: number; nextAt: number; stationed: boolean };

type MineConfig = {
  job: MineJob;
  resource: ResourceKey;
  label: string;
  amount: number;
  cycleMs: number;
  tint: number;
  station: { x: number; y: number };
};

const CONFIGS: Record<MineJob, MineConfig> = {
  ironMiner: { job: 'ironMiner', resource: 'iron', label: '铁', amount: 2, cycleMs: 10_000, tint: 0x9c8370, station: { x: 955, y: 500 } },
  coalMiner: { job: 'coalMiner', resource: 'coal', label: '煤', amount: 2, cycleMs: 11_000, tint: 0x6e7070, station: { x: 995, y: 575 } },
  sulphurMiner: { job: 'sulphurMiner', resource: 'sulphur', label: '硫磺', amount: 1, cycleMs: 13_000, tint: 0xc7b35c, station: { x: 1030, y: 650 } },
};

const runtimes = new WeakMap<Phaser.GameObjects.Image, Runtime>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}
function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}
function getResource(scene: BuildScene, key: ResourceKey): number {
  return Number(getPrivate<number>(scene, key) ?? 0);
}
function addResource(scene: BuildScene, key: ResourceKey, amount: number): void {
  setPrivate(scene, key, Math.max(0, getResource(scene, key) + amount));
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}
function configFor(job: unknown): MineConfig | undefined {
  return CONFIGS[String(job) as MineJob];
}
function runtimeFor(worker: Phaser.GameObjects.Image): Runtime {
  let runtime = runtimes.get(worker);
  if (!runtime) {
    runtime = { job: null, version: -1, nextAt: 0, stationed: false };
    runtimes.set(worker, runtime);
  }
  return runtime;
}
function popup(scene: BuildScene, worker: Phaser.GameObjects.Image, config: MineConfig): void {
  const text = scene.add.text(worker.x, worker.y - 72, `+${config.amount} ${config.label}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff1b3', fontStyle: 'bold', stroke: '#493b2f', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({ targets: text, y: text.y - 34, alpha: 0, duration: 800, onComplete: () => text.destroy() });
}
function stationWorker(scene: BuildScene, worker: Phaser.GameObjects.Image, config: MineConfig, runtime: Runtime): void {
  scene.tweens.killTweensOf(worker);
  worker.setVisible(true).setTint(config.tint);
  runtime.stationed = false;
  runtime.nextAt = scene.time.now + config.cycleMs;
  scene.tweens.add({
    targets: worker,
    x: config.station.x + Phaser.Math.Between(-16, 16),
    y: config.station.y + Phaser.Math.Between(-18, 18),
    duration: Phaser.Math.Between(1200, 1700),
    ease: 'Sine.InOut',
    onComplete: () => { runtime.stationed = true; },
  });
}
function resetWorker(scene: BuildScene, worker: Phaser.GameObjects.Image, runtime: Runtime): void {
  runtime.job = null;
  runtime.version = -1;
  runtime.nextAt = 0;
  runtime.stationed = false;
  if (worker.active) worker.clearTint().setVisible(true);
  scene.tweens.killTweensOf(worker);
}
function tickMiner(scene: BuildScene, worker: Phaser.GameObjects.Image, config: MineConfig): void {
  const runtime = runtimeFor(worker);
  const version = Number(worker.getData('jobVersion') ?? 0);
  if (runtime.job !== config.job || runtime.version !== version) {
    runtime.job = config.job;
    runtime.version = version;
    stationWorker(scene, worker, config, runtime);
    return;
  }
  if (!runtime.stationed || scene.time.now < runtime.nextAt) return;
  addResource(scene, config.resource, config.amount);
  popup(scene, worker, config);
  scene.tweens.add({ targets: worker, y: worker.y - 8, yoyo: true, duration: 130 });
  runtime.nextAt = scene.time.now + config.cycleMs;
}
function tick(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const worker of workers) {
    if (!worker.active) continue;
    const config = configFor(worker.getData('job'));
    const runtime = runtimeFor(worker);
    if (!config) {
      if (runtime.job) resetWorker(scene, worker, runtime);
      continue;
    }
    tickMiner(scene, worker, config);
  }
}

export function installMineWorkerPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, any>;
  if (proto.__mineWorkerPatched) return;
  proto.__mineWorkerPatched = true;
  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tick(this);
    return result;
  };
}
