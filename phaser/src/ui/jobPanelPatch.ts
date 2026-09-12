import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type JobId = 'gatherer' | 'hunter' | 'explorer' | 'ironMiner' | 'coalMiner' | 'sulphurMiner' | 'tanner' | 'charcutier' | 'steelworker' | 'armourer';
type BuildingId = 'lodge' | 'tannery' | 'smokehouse' | 'steelworks' | 'armoury';
type MineType = 'iron' | 'coal' | 'sulphur';

interface JobDef {
  id: JobId;
  name: string;
  description: string;
  requires?: BuildingId;
  requiresName?: string;
  requiresMine?: MineType;
  requiresMineName?: string;
}
interface JobState {
  button: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Container;
  open: boolean;
  restored: boolean;
  lastPopulation: number;
  counts: Record<JobId, number>;
  countTexts: Map<JobId, Phaser.GameObjects.Text>;
  stateTexts: Map<JobId, Phaser.GameObjects.Text>;
}

const JOB_SAVE_KEY = 'xiaohw-job-counts-v1';
const JOBS: JobDef[] = [
  { id: 'gatherer', name: '采集者', description: '自动采集木材并送回营地' },
  { id: 'hunter', name: '猎人', description: '外出狩猎，稳定获得毛皮与肉', requires: 'lodge', requiresName: '猎人小屋' },
  { id: 'explorer', name: '探险家', description: '消耗肉作为补给，深入森林带回稀有材料', requires: 'lodge', requiresName: '猎人小屋' },
  { id: 'ironMiner', name: '铁矿工', description: '在已占领铁矿持续开采铁', requiresMine: 'iron', requiresMineName: '铁矿' },
  { id: 'coalMiner', name: '煤矿工', description: '在已占领煤矿持续开采煤', requiresMine: 'coal', requiresMineName: '煤矿' },
  { id: 'sulphurMiner', name: '硫磺矿工', description: '在已占领硫磺矿持续开采硫磺', requiresMine: 'sulphur', requiresMineName: '硫磺矿' },
  { id: 'tanner', name: '制革师', description: '把毛皮加工成皮革', requires: 'tannery', requiresName: '制革屋' },
  { id: 'charcutier', name: '熏肉师', description: '把肉加工成熏肉', requires: 'smokehouse', requiresName: '熏肉房' },
  { id: 'steelworker', name: '炼钢工', description: '驻厂生产：铁 + 煤 → 钢', requires: 'steelworks', requiresName: '炼钢坊' },
  { id: 'armourer', name: '军械师', description: '驻厂生产：钢 + 硫磺 → 子弹', requires: 'armoury', requiresName: '军械库' },
];
const JOB_IDS = JOBS.map((job) => job.id);
const states = new WeakMap<BuildScene, JobState>();

function emptyCounts(): Record<JobId, number> {
  return { gatherer: 0, hunter: 0, explorer: 0, ironMiner: 0, coalMiner: 0, sulphurMiner: 0, tanner: 0, charcutier: 0, steelworker: 0, armourer: 0 };
}
function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}
function hasBuilding(scene: BuildScene, id?: BuildingId): boolean {
  if (!id) return true;
  const placed = ((scene as unknown as { placed?: Array<{ id: string }> }).placed ?? []);
  return placed.some((building) => building.id === id);
}
function hasMine(scene: BuildScene, type?: MineType): boolean {
  if (!type) return true;
  const flags = (scene as unknown as { claimedMineTypes?: Partial<Record<MineType, boolean>> }).claimedMineTypes;
  return Boolean(flags?.[type]);
}
function isUnlocked(scene: BuildScene, job: JobDef): boolean {
  return hasBuilding(scene, job.requires) && hasMine(scene, job.requiresMine);
}
function lockedReason(job: JobDef): string {
  if (job.requiresMine) return `需占领${job.requiresMineName}`;
  if (job.requires) return `需 ${job.requiresName}`;
  return '';
}
function saveJobCounts(state: JobState): void {
  try { window.localStorage.setItem(JOB_SAVE_KEY, JSON.stringify(state.counts)); } catch { /* storage unavailable */ }
}
function restoreJobCounts(scene: BuildScene, state: JobState, population: number): void {
  const next = emptyCounts();
  let remaining = Math.max(0, Math.floor(population));
  let saved: Partial<Record<JobId, number>> | null = null;
  try {
    const raw = window.localStorage.getItem(JOB_SAVE_KEY);
    if (raw) saved = JSON.parse(raw) as Partial<Record<JobId, number>>;
  } catch {
    saved = null;
  }
  if (saved) {
    for (const job of JOBS) {
      if (job.id === 'gatherer' || !isUnlocked(scene, job) || remaining <= 0) continue;
      const desired = Math.max(0, Math.floor(Number(saved[job.id] ?? 0)));
      const amount = Math.min(desired, remaining);
      next[job.id] = amount;
      remaining -= amount;
    }
  }
  next.gatherer = remaining;
  state.counts = next;
  state.lastPopulation = population;
  state.restored = true;
  applyWorkerJobs(scene, state);
  refresh(scene, state);
}
function positionUi(scene: BuildScene, state: JobState): void {
  const view = scene.cameras.main.worldView;
  state.button.setVisible(false);
  state.panel.setPosition(view.centerX, view.centerY).setDepth(5300);
}
function refresh(scene: BuildScene, state: JobState): void {
  for (const job of JOBS) {
    state.countTexts.get(job.id)?.setText(String(state.counts[job.id]));
    const status = state.stateTexts.get(job.id);
    if (!status) continue;
    if (isUnlocked(scene, job)) status.setText(job.id === 'gatherer' ? '默认岗位' : '已解锁').setColor('#a7c893');
    else status.setText(lockedReason(job)).setColor('#8e9689');
  }
}
function setWorkerJob(scene: BuildScene, worker: Phaser.GameObjects.Image, nextJob: JobId, anyScene: { startWorkerLoop?: (worker: Phaser.GameObjects.Image, delay?: number) => void }): void {
  const previous = (worker.getData('job') as JobId | undefined) ?? 'gatherer';
  if (previous === nextJob) return;
  const version = Number(worker.getData('jobVersion') ?? 0) + 1;
  worker.setData('jobVersion', version);
  worker.setData('job', nextJob);
  worker.setData('workPhase', 'switching');
  scene.tweens.killTweensOf(worker);
  worker.setVisible(true);
  if (nextJob === 'gatherer') {
    worker.clearTint();
    anyScene.startWorkerLoop?.(worker, Phaser.Math.Between(200, 500));
  }
}
function applyWorkerJobs(scene: BuildScene, state: JobState): void {
  const anyScene = scene as unknown as { workers?: Phaser.GameObjects.Image[]; startWorkerLoop?: (worker: Phaser.GameObjects.Image, delay?: number) => void };
  const workers = (anyScene.workers ?? []).filter((worker) => worker.active);
  const remaining: Record<JobId, number> = { ...state.counts };
  const keep = new Set<Phaser.GameObjects.Image>();
  for (const worker of workers) {
    const current = ((worker.getData('job') as JobId | undefined) ?? 'gatherer');
    if (remaining[current] > 0) { remaining[current] -= 1; keep.add(worker); }
  }
  const missing: JobId[] = [];
  for (const jobId of JOB_IDS) for (let i = 0; i < remaining[jobId]; i += 1) missing.push(jobId);
  workers.filter((worker) => !keep.has(worker)).forEach((worker, index) => setWorkerJob(scene, worker, missing[index] ?? 'gatherer', anyScene));
  for (const worker of workers) {
    if (!worker.getData('job')) worker.setData('job', 'gatherer');
    if (worker.getData('jobVersion') == null) worker.setData('jobVersion', 0);
  }
}
function adjust(scene: BuildScene, state: JobState, job: JobDef, delta: number): void {
  if (!isUnlocked(scene, job)) {
    const message = job.requiresMine ? `需要先在荒野占领${job.requiresMineName}` : `需要先建造${job.requiresName}`;
    (scene as unknown as { showToast?: (message: string) => void }).showToast?.(message);
    return;
  }
  if (delta > 0) {
    if (job.id === 'gatherer') {
      const donor = JOBS.find((candidate) => candidate.id !== 'gatherer' && state.counts[candidate.id] > 0);
      if (!donor) return;
      state.counts[donor.id] -= 1; state.counts.gatherer += 1;
    } else {
      if (state.counts.gatherer <= 0) return;
      state.counts.gatherer -= 1; state.counts[job.id] += 1;
    }
  } else {
    if (job.id === 'gatherer' || state.counts[job.id] <= 0) return;
    state.counts[job.id] -= 1; state.counts.gatherer += 1;
  }
  applyWorkerJobs(scene, state);
  refresh(scene, state);
  saveJobCounts(state);
}
function createUi(scene: BuildScene): JobState {
  const buttonBg = scene.add.rectangle(0, 0, 242, 64, 0x344737, 0.98).setStrokeStyle(2, 0x91a47d, 1).setInteractive({ useHandCursor: true });
  const buttonText = scene.add.text(0, 0, '人口分工', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff2d3', fontStyle: 'bold' }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [buttonBg, buttonText]).setVisible(false);
  const panelBg = scene.add.rectangle(0, 0, 860, 1040, 0x1f2921, 0.99).setStrokeStyle(3, 0x768a66, 1).setInteractive();
  const header = scene.add.text(-380, -480, '人口管理', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff3dc', fontStyle: 'bold' });
  const sub = scene.add.text(-380, -434, '人口默认是采集者；矿工岗位需要先在荒野占领对应矿场。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebda3' });
  const closeBg = scene.add.circle(370, -460, 26, 0x3e4e40, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(370, -461, '×', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);
  const countTexts = new Map<JobId, Phaser.GameObjects.Text>();
  const stateTexts = new Map<JobId, Phaser.GameObjects.Text>();
  const children: Phaser.GameObjects.GameObject[] = [panelBg, header, sub, closeBg, closeText];
  const state: JobState = {
    button, panel: scene.add.container(0, 0), open: false, restored: false,
    lastPopulation: Number((scene as unknown as { population?: number }).population ?? 0),
    counts: emptyCounts(),
    countTexts, stateTexts,
  };
  state.counts.gatherer = state.lastPopulation;
  JOBS.forEach((job, index) => {
    const y = -360 + index * 76;
    const row = scene.add.rectangle(0, y, 776, 62, 0x2d392f, 1).setStrokeStyle(1, 0x516552, 1);
    const name = scene.add.text(-355, y - 17, job.name, { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff5de', fontStyle: 'bold' });
    const desc = scene.add.text(-355, y + 9, job.description, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#9fb091' });
    const stateText = scene.add.text(112, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#87977f' }).setOrigin(1, 0.5);
    const minus = scene.add.rectangle(210, y, 52, 42, 0x465847, 1).setStrokeStyle(1, 0x71836b, 1).setInteractive({ useHandCursor: true });
    const minusText = scene.add.text(210, y - 1, '−', { fontSize: '27px', color: '#ffffff' }).setOrigin(0.5);
    const count = scene.add.text(280, y, '0', { fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#fff0bd', fontStyle: 'bold' }).setOrigin(0.5);
    const plus = scene.add.rectangle(350, y, 52, 42, 0x536a50, 1).setStrokeStyle(1, 0x809476, 1).setInteractive({ useHandCursor: true });
    const plusText = scene.add.text(350, y - 1, '+', { fontSize: '27px', color: '#ffffff' }).setOrigin(0.5);
    minus.on('pointerdown', () => adjust(scene, state, job, -1));
    plus.on('pointerdown', () => adjust(scene, state, job, 1));
    countTexts.set(job.id, count);
    stateTexts.set(job.id, stateText);
    children.push(row, name, desc, stateText, minus, minusText, count, plus, plusText);
  });
  state.panel.add(children).setVisible(false);
  const toggle = (open?: boolean) => { state.open = open ?? !state.open; state.panel.setVisible(state.open); refresh(scene, state); };
  setPrivate(scene, 'openPopulationPanel', () => toggle(true));
  setPrivate(scene, 'closePopulationPanel', () => toggle(false));
  buttonBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); toggle(); });
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); toggle(false); });
  panelBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  positionUi(scene, state);
  refresh(scene, state);
  return state;
}

export function installJobPanelPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, any>;
  if ((proto as Record<string, unknown>).__jobPanelPatched) return;
  (proto as Record<string, unknown>).__jobPanelPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  const originalStartWorkerLoop = proto.startWorkerLoop;
  const originalReturnWorkerToCamp = proto.returnWorkerToCamp;
  proto.create = function patchedCreate(this: BuildScene, ...args: unknown[]) {
    const result = originalCreate.apply(this, args);
    const state = createUi(this);
    states.set(this, state);
    applyWorkerJobs(this, state);
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: unknown[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (!state) return result;
    const population = Number((this as unknown as { population?: number }).population ?? 0);
    if (!state.restored) {
      restoreJobCounts(this, state, population);
    } else {
      if (population > state.lastPopulation) state.counts.gatherer += population - state.lastPopulation;
      if (population < state.lastPopulation) state.counts.gatherer = Math.max(0, state.counts.gatherer - (state.lastPopulation - population));
      if (population !== state.lastPopulation) {
        state.lastPopulation = population;
        applyWorkerJobs(this, state);
        refresh(this, state);
        saveJobCounts(state);
      }
    }
    positionUi(this, state);
    if (state.open) refresh(this, state);
    return result;
  };
  proto.startWorkerLoop = function patchedStartWorkerLoop(this: BuildScene, worker: Phaser.GameObjects.Image, delay = 0) {
    if (!worker.getData('job')) worker.setData('job', 'gatherer');
    if (worker.getData('job') !== 'gatherer') return;
    return originalStartWorkerLoop.call(this, worker, delay);
  };
  proto.returnWorkerToCamp = function patchedReturnWorker(this: BuildScene, worker: Phaser.GameObjects.Image) {
    if (worker.getData('job') !== 'gatherer') return;
    return originalReturnWorkerToCamp.call(this, worker);
  };
}
