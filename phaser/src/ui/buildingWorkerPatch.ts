import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'meat' | 'fur' | 'leather' | 'curedMeat';
type SupportedJob = 'tanner' | 'charcutier';
type BuildingId = 'tannery' | 'smokehouse';
type Phase = 'idle' | 'walkingIn' | 'inside';

type WorkerRuntime = {
  phase: Phase;
  jobVersion: number;
  token: number;
  nextCompleteAt: number;
  waitingForInput: boolean;
};

type JobConfig = {
  job: SupportedJob;
  building: BuildingId;
  tint: number;
  workMs: number;
  input: Partial<Record<ResourceKey, number>>;
  inputLabel: string;
  output: { key: ResourceKey; amount: number; label: string };
};

type BuildingBadge = {
  container: Phaser.GameObjects.Container;
  title: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
};

const JOBS: JobConfig[] = [
  {
    job: 'tanner', building: 'tannery', tint: 0x9a7650, workMs: 10_000,
    input: { fur: 5 }, inputLabel: '毛皮 -5', output: { key: 'leather', amount: 1, label: '皮革' },
  },
  {
    job: 'charcutier', building: 'smokehouse', tint: 0x9b5848, workMs: 10_000,
    input: { meat: 5, wood: 5 }, inputLabel: '肉 -5 · 木材 -5', output: { key: 'curedMeat', amount: 1, label: '熏肉' },
  },
];

const configs = new Map<string, JobConfig>(JOBS.map((config) => [config.job, config]));
const runtimes = new WeakMap<Phaser.GameObjects.Image, WorkerRuntime>();
const badges = new WeakMap<BuildScene, Map<BuildingId, BuildingBadge>>();

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
    runtime = { phase: 'idle', jobVersion: -1, token: 0, nextCompleteAt: 0, waitingForInput: false };
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
  const popup = scene.add.text(building.x, building.y - building.displayHeight * 0.62, `+${config.output.amount} ${config.output.label}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff0b0', fontStyle: 'bold',
    stroke: '#49362a', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6500);
  scene.tweens.add({ targets: popup, y: popup.y - 42, alpha: 0, duration: 850, onComplete: () => popup.destroy() });
  scene.tweens.add({ targets: building, scaleX: building.scaleX * 1.018, scaleY: building.scaleY * 1.018, yoyo: true, duration: 110 });
}

function resetWorker(scene: BuildScene, worker: Phaser.GameObjects.Image, runtime: WorkerRuntime): void {
  runtime.token += 1;
  runtime.phase = 'idle';
  runtime.nextCompleteAt = 0;
  runtime.waitingForInput = false;
  scene.tweens.killTweensOf(worker);
  if (worker.active) {
    worker.setVisible(true);
    worker.clearTint();
  }
}

function beginProduction(scene: BuildScene, worker: Phaser.GameObjects.Image, config: JobConfig, runtime: WorkerRuntime): void {
  const version = Number(worker.getData('jobVersion') ?? 0);
  if (!worker.active || worker.getData('job') !== config.job || runtime.jobVersion !== version || runtime.phase !== 'inside') return;
  if (!payInputs(scene, config)) {
    runtime.waitingForInput = true;
    runtime.nextCompleteAt = scene.time.now + 1000;
    return;
  }
  runtime.waitingForInput = false;
  runtime.nextCompleteAt = scene.time.now + config.workMs;
}

function enterBuilding(scene: BuildScene, worker: Phaser.GameObjects.Image, config: JobConfig): void {
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
    x: building.x + Phaser.Math.Between(-26, 26),
    y: building.y + Math.max(20, building.displayHeight * 0.24),
    duration: Phaser.Math.Between(900, 1400),
    ease: 'Sine.InOut',
    onComplete: () => {
      if (!worker.active || worker.getData('job') !== config.job || Number(worker.getData('jobVersion') ?? 0) !== version || runtime.token !== token) return;
      runtime.phase = 'inside';
      worker.setVisible(false);
      beginProduction(scene, worker, config, runtime);
    },
  });
}

function tickInsideWorker(scene: BuildScene, worker: Phaser.GameObjects.Image, config: JobConfig, runtime: WorkerRuntime): void {
  const version = Number(worker.getData('jobVersion') ?? 0);
  if (runtime.jobVersion !== version) {
    resetWorker(scene, worker, runtime);
    return;
  }
  worker.setVisible(false);
  if (scene.time.now < runtime.nextCompleteAt) return;

  if (runtime.waitingForInput) {
    beginProduction(scene, worker, config, runtime);
    return;
  }

  const building = getBuilding(scene, config.building);
  if (!building) {
    resetWorker(scene, worker, runtime);
    return;
  }
  addResource(scene, config.output.key, config.output.amount);
  refresh(scene);
  showOutput(scene, building, config);
  beginProduction(scene, worker, config, runtime);
}

function getBadgeMap(scene: BuildScene): Map<BuildingId, BuildingBadge> {
  let map = badges.get(scene);
  if (!map) {
    map = new Map();
    badges.set(scene, map);
  }
  return map;
}

function ensureBadge(scene: BuildScene, config: JobConfig, building: Phaser.GameObjects.Image): BuildingBadge {
  const map = getBadgeMap(scene);
  let badge = map.get(config.building);
  if (badge) return badge;
  const bg = scene.add.rectangle(0, 0, 260, 82, 0x253026, 0.94).setStrokeStyle(2, 0x768765, 1);
  const title = scene.add.text(0, -20, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff1cd', fontStyle: 'bold',
  }).setOrigin(0.5);
  const status = scene.add.text(0, 16, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#c7d4ba',
  }).setOrigin(0.5);
  const container = scene.add.container(building.x, building.y - building.displayHeight * 0.68, [bg, title, status]).setDepth(6100);
  getPrivate<Phaser.GameObjects.Container>(scene, 'world')?.add(container);
  badge = { container, title, status };
  map.set(config.building, badge);
  return badge;
}

function refreshBadges(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const config of JOBS) {
    const building = getBuilding(scene, config.building);
    const map = getBadgeMap(scene);
    const existing = map.get(config.building);
    if (!building) {
      existing?.container.setVisible(false);
      continue;
    }
    const assigned = workers.filter((worker) => worker.active && worker.getData('job') === config.job);
    if (assigned.length === 0) {
      existing?.container.setVisible(false);
      continue;
    }
    const badge = ensureBadge(scene, config, building);
    badge.container.setVisible(true).setPosition(building.x, building.y - building.displayHeight * 0.68);
    const inside = assigned.map((worker) => getRuntime(worker)).filter((runtime) => runtime.phase === 'inside');
    badge.title.setText(`${config.output.label}生产 · ${inside.length}/${assigned.length} 人`);
    const waiting = inside.some((runtime) => runtime.waitingForInput);
    if (inside.length === 0) {
      badge.status.setText('工人正在进入建筑').setColor('#d7cba7');
      continue;
    }
    if (waiting && inside.every((runtime) => runtime.waitingForInput)) {
      badge.status.setText(`材料不足 · 需要 ${config.inputLabel}`).setColor('#e4a48d');
      continue;
    }
    const readyAt = Math.min(...inside.filter((runtime) => !runtime.waitingForInput).map((runtime) => runtime.nextCompleteAt));
    const seconds = Math.max(0, Math.ceil((readyAt - scene.time.now) / 1000));
    badge.status.setText(`CD ${seconds}s · 收入材料：${config.inputLabel}`).setColor('#c7d4ba');
  }
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
      if (runtime.phase !== 'idle' || !worker.visible) resetWorker(scene, worker, runtime);
      continue;
    }

    if (runtime.jobVersion !== -1 && runtime.jobVersion !== version) {
      resetWorker(scene, worker, runtime);
    }
    if (runtime.phase === 'idle') enterBuilding(scene, worker, config);
    else if (runtime.phase === 'inside') tickInsideWorker(scene, worker, config, runtime);
  }
  refreshBadges(scene);
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
