import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'meat' | 'fur' | 'leather' | 'curedMeat';
type SupportedJob = 'tanner' | 'charcutier';
type BuildingId = 'tannery' | 'smokehouse';
type Phase = 'idle' | 'walkingIn' | 'working' | 'walkingOut';

type WorkerRuntime = {
  phase: Phase;
  jobVersion: number;
  token: number;
};

type JobConfig = {
  job: SupportedJob;
  building: BuildingId;
  tint: number;
  workMs: number;
  input: Partial<Record<ResourceKey, number>>;
  output: { key: ResourceKey; amount: number; label: string };
};

const JOBS: JobConfig[] = [
  {
    job: 'tanner', building: 'tannery', tint: 0x9a7650, workMs: 10_000,
    input: { fur: 5 }, output: { key: 'leather', amount: 1, label: '皮革' },
  },
  {
    job: 'charcutier', building: 'smokehouse', tint: 0x9b5848, workMs: 10_000,
    input: { meat: 5, wood: 5 }, output: { key: 'curedMeat', amount: 1, label: '熏肉' },
  },
];

const configs = new Map<string, JobConfig>(JOBS.map((config) => [config.job, config]));
const runtimes = new WeakMap<Phaser.GameObjects.Image, WorkerRuntime>();

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
}

function refresh(scene: BuildScene): void {
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function getBuilding(scene: BuildScene, id: BuildingId): Phaser.GameObjects.Image | undefined {
  const placed = getPrivate<Array<{ id: string; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  return placed.find((building) => building.id === id)?.sprite;
}

function getRuntime(worker: Phaser.GameObjects.Image): WorkerRuntime {
  let runtime = runtimes.get(worker);
  if (!runtime) {
    runtime = { phase: 'idle', jobVersion: -1, token: 0 };
    runtimes.set(worker, runtime);
  }
  return runtime;
}

function canProduce(scene: BuildScene, config: JobConfig): boolean {
  return Object.entries(config.input).every(([key, amount]) => getResource(scene, key as ResourceKey) >= Number(amount));
}

function payInputs(scene: BuildScene, config: JobConfig): boolean {
  if (!canProduce(scene, config)) return false;
  for (const [key, amount] of Object.entries(config.input)) addResource(scene, key as ResourceKey, -Number(amount));
  refresh(scene);
  return true;
}

function showOutput(scene: BuildScene, building: Phaser.GameObjects.Image, config: JobConfig): void {
  const popup = scene.add.text(building.x, building.y - building.displayHeight * 0.55, `+${config.output.amount} ${config.output.label}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff0b0', fontStyle: 'bold',
    stroke: '#49362a', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({ targets: popup, y: popup.y - 42, alpha: 0, duration: 850, onComplete: () => popup.destroy() });
  scene.tweens.add({ targets: building, scaleX: building.scaleX * 1.025, scaleY: building.scaleY * 1.025, yoyo: true, duration: 110 });
}

function resetWorker(scene: BuildScene, worker: Phaser.GameObjects.Image, runtime: WorkerRuntime): void {
  runtime.token += 1;
  runtime.phase = 'idle';
  scene.tweens.killTweensOf(worker);
  if (worker.active) {
    worker.setVisible(true);
    worker.clearTint();
  }
}

function startLoop(scene: BuildScene, worker: Phaser.GameObjects.Image, config: JobConfig): void {
  const runtime = getRuntime(worker);
  if (runtime.phase !== 'idle') return;
  const building = getBuilding(scene, config.building);
  if (!building) return;

  runtime.phase = 'walkingIn';
  runtime.token += 1;
  const token = runtime.token;
  const version = Number(worker.getData('jobVersion') ?? 0);
  runtime.jobVersion = version;
  scene.tweens.killTweensOf(worker);
  worker.setVisible(true).setTint(config.tint);

  scene.tweens.add({
    targets: worker,
    x: building.x + Phaser.Math.Between(-30, 30),
    y: building.y + Math.max(22, building.displayHeight * 0.24),
    duration: Phaser.Math.Between(1200, 1800),
    ease: 'Sine.InOut',
    onComplete: () => {
      if (!worker.active || worker.getData('job') !== config.job || Number(worker.getData('jobVersion') ?? 0) !== version || runtime.token !== token) return;
      if (!payInputs(scene, config)) {
        runtime.phase = 'idle';
        scene.time.delayedCall(1200, () => {
          if (worker.active && worker.getData('job') === config.job && Number(worker.getData('jobVersion') ?? 0) === version && runtime.token === token) startLoop(scene, worker, config);
        });
        return;
      }
      runtime.phase = 'working';
      worker.setVisible(false);
      scene.time.delayedCall(config.workMs, () => {
        if (!worker.active || worker.getData('job') !== config.job || Number(worker.getData('jobVersion') ?? 0) !== version || runtime.token !== token) return;
        addResource(scene, config.output.key, config.output.amount);
        refresh(scene);
        showOutput(scene, building, config);
        runtime.phase = 'walkingOut';
        worker.setPosition(building.x + Phaser.Math.Between(-24, 24), building.y + Math.max(22, building.displayHeight * 0.24));
        worker.setVisible(true).setTint(config.tint);
        const exitX = building.x + Phaser.Math.Between(-95, 95);
        const exitY = building.y + building.displayHeight * 0.42 + Phaser.Math.Between(20, 55);
        scene.tweens.add({
          targets: worker,
          x: exitX,
          y: exitY,
          duration: 700,
          ease: 'Sine.Out',
          onComplete: () => {
            if (!worker.active || worker.getData('job') !== config.job || Number(worker.getData('jobVersion') ?? 0) !== version || runtime.token !== token) return;
            runtime.phase = 'idle';
            scene.time.delayedCall(350, () => {
              if (worker.active && worker.getData('job') === config.job && Number(worker.getData('jobVersion') ?? 0) === version && runtime.token === token) startLoop(scene, worker, config);
            });
          },
        });
      });
    },
  });
}

function tickWorkers(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const worker of workers) {
    if (!worker.active) continue;
    const job = String(worker.getData('job') ?? 'gatherer');
    const config = configs.get(job);
    const runtime = getRuntime(worker);
    const version = Number(worker.getData('jobVersion') ?? 0);
    if (!config) {
      if (runtime.phase !== 'idle') resetWorker(scene, worker, runtime);
      continue;
    }
    if (runtime.jobVersion !== -1 && runtime.jobVersion !== version) resetWorker(scene, worker, runtime);
    worker.setTint(config.tint);
    if (runtime.phase === 'idle') startLoop(scene, worker, config);
  }
}

export function installBuildingWorkerPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__buildingWorkerPatched) return;
  marker.__buildingWorkerPatched = true;

  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tickWorkers(this);
    return result;
  };
}
