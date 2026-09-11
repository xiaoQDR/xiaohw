import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type JobId = 'gatherer' | 'hunter' | 'trapper' | 'tanner' | 'charcutier';
type BuildingId = 'lodge' | 'tannery' | 'smokehouse';

interface JobDef {
  id: JobId;
  name: string;
  description: string;
  requires?: BuildingId;
  requiresName?: string;
}

interface JobState {
  button: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Container;
  open: boolean;
  lastPopulation: number;
  counts: Record<JobId, number>;
  countTexts: Map<JobId, Phaser.GameObjects.Text>;
  stateTexts: Map<JobId, Phaser.GameObjects.Text>;
}

const MENU_H = 430;
const JOBS: JobDef[] = [
  { id: 'gatherer', name: '采集者', description: '自动砍树并把木材送回火堆' },
  { id: 'hunter', name: '猎人', description: '外出狩猎，获得毛皮与肉', requires: 'lodge', requiresName: '猎人小屋' },
  { id: 'trapper', name: '陷阱师', description: '管理陷阱与诱饵', requires: 'lodge', requiresName: '猎人小屋' },
  { id: 'tanner', name: '制革师', description: '把毛皮加工成皮革', requires: 'tannery', requiresName: '制革屋' },
  { id: 'charcutier', name: '熏肉师', description: '把肉加工成熏肉', requires: 'smokehouse', requiresName: '熏肉房' },
];

const states = new WeakMap<BuildScene, JobState>();

function hasBuilding(scene: BuildScene, id?: BuildingId): boolean {
  if (!id) return true;
  const placed = ((scene as unknown as { placed?: Array<{ id: string }> }).placed ?? []);
  return placed.some((building) => building.id === id);
}

function positionUi(scene: BuildScene, state: JobState): void {
  const view = scene.cameras.main.worldView;
  state.button.setPosition(view.centerX, view.bottom - MENU_H - 54).setDepth(5200);
  state.panel.setPosition(view.centerX, view.bottom - MENU_H - 82).setDepth(5300);
}

function refresh(scene: BuildScene, state: JobState): void {
  for (const job of JOBS) {
    state.countTexts.get(job.id)?.setText(String(state.counts[job.id]));
    const status = state.stateTexts.get(job.id);
    if (!status) continue;
    if (hasBuilding(scene, job.requires)) {
      status.setText(job.id === 'gatherer' ? '默认岗位' : '已解锁').setColor('#a7c893');
    } else {
      status.setText(`需 ${job.requiresName}`).setColor('#8e9689');
    }
  }
}

function applyWorkerJobs(scene: BuildScene, state: JobState): void {
  const anyScene = scene as unknown as {
    workers?: Phaser.GameObjects.Image[];
    startWorkerLoop?: (worker: Phaser.GameObjects.Image, delay?: number) => void;
  };
  const workers = anyScene.workers ?? [];
  const assignment: JobId[] = [];
  for (const job of JOBS) {
    for (let i = 0; i < state.counts[job.id]; i += 1) assignment.push(job.id);
  }

  workers.forEach((worker, index) => {
    const nextJob = assignment[index] ?? 'gatherer';
    const previous = (worker.getData('job') as JobId | undefined) ?? 'gatherer';
    worker.setData('job', nextJob);
    if (nextJob === 'gatherer') {
      worker.clearTint();
      if (previous !== 'gatherer') anyScene.startWorkerLoop?.(worker, Phaser.Math.Between(150, 550));
    } else {
      worker.setTint(0xc4c1b2);
      scene.tweens.killTweensOf(worker);
    }
  });
}

function adjust(scene: BuildScene, state: JobState, job: JobDef, delta: number): void {
  if (!hasBuilding(scene, job.requires)) {
    const anyScene = scene as unknown as { showToast?: (message: string) => void };
    anyScene.showToast?.(`需要先建造${job.requiresName}`);
    return;
  }

  if (delta > 0) {
    if (job.id === 'gatherer') {
      const donor = JOBS.find((candidate) => candidate.id !== 'gatherer' && state.counts[candidate.id] > 0);
      if (!donor) return;
      state.counts[donor.id] -= 1;
      state.counts.gatherer += 1;
    } else {
      if (state.counts.gatherer <= 0) return;
      state.counts.gatherer -= 1;
      state.counts[job.id] += 1;
    }
  } else {
    if (job.id === 'gatherer' || state.counts[job.id] <= 0) return;
    state.counts[job.id] -= 1;
    state.counts.gatherer += 1;
  }

  applyWorkerJobs(scene, state);
  refresh(scene, state);
}

function createUi(scene: BuildScene): JobState {
  const buttonBg = scene.add.rectangle(0, 0, 242, 64, 0x344737, 0.98)
    .setStrokeStyle(2, 0x91a47d, 1)
    .setInteractive({ useHandCursor: true });
  const buttonText = scene.add.text(0, 0, '人口分工', {
    fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff2d3', fontStyle: 'bold',
  }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [buttonBg, buttonText]);

  const panelBg = scene.add.rectangle(0, -300, 820, 570, 0x1f2921, 0.99)
    .setStrokeStyle(3, 0x768a66, 1)
    .setInteractive();
  const header = scene.add.text(-360, -545, '人口分工', {
    fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff3dc', fontStyle: 'bold',
  });
  const sub = scene.add.text(-360, -497, '人口默认是采集者，可以调到其他已解锁岗位。', {
    fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#aebda3',
  });
  const closeBg = scene.add.circle(350, -525, 26, 0x3e4e40, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(350, -526, '×', {
    fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#ffffff',
  }).setOrigin(0.5);

  const countTexts = new Map<JobId, Phaser.GameObjects.Text>();
  const stateTexts = new Map<JobId, Phaser.GameObjects.Text>();
  const children: Phaser.GameObjects.GameObject[] = [panelBg, header, sub, closeBg, closeText];

  const state: JobState = {
    button,
    panel: scene.add.container(0, 0),
    open: false,
    lastPopulation: Number((scene as unknown as { population?: number }).population ?? 0),
    counts: { gatherer: 0, hunter: 0, trapper: 0, tanner: 0, charcutier: 0 },
    countTexts,
    stateTexts,
  };
  state.counts.gatherer = state.lastPopulation;

  JOBS.forEach((job, index) => {
    const y = -430 + index * 84;
    const row = scene.add.rectangle(0, y, 736, 70, 0x2d392f, 1).setStrokeStyle(1, 0x516552, 1);
    const name = scene.add.text(-335, y - 20, job.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff5de', fontStyle: 'bold',
    });
    const desc = scene.add.text(-335, y + 10, job.description, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#9fb091',
    });
    const stateText = scene.add.text(92, y, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#87977f',
    }).setOrigin(1, 0.5);
    const minus = scene.add.rectangle(190, y, 52, 48, 0x465847, 1)
      .setStrokeStyle(1, 0x71836b, 1)
      .setInteractive({ useHandCursor: true });
    const minusText = scene.add.text(190, y - 1, '−', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);
    const count = scene.add.text(260, y, '0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#fff0bd', fontStyle: 'bold',
    }).setOrigin(0.5);
    const plus = scene.add.rectangle(330, y, 52, 48, 0x536a50, 1)
      .setStrokeStyle(1, 0x809476, 1)
      .setInteractive({ useHandCursor: true });
    const plusText = scene.add.text(330, y - 1, '+', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    minus.on('pointerdown', () => adjust(scene, state, job, -1));
    plus.on('pointerdown', () => adjust(scene, state, job, 1));
    countTexts.set(job.id, count);
    stateTexts.set(job.id, stateText);
    children.push(row, name, desc, stateText, minus, minusText, count, plus, plusText);
  });

  state.panel.add(children).setVisible(false);
  const toggle = (open?: boolean) => {
    state.open = open ?? !state.open;
    state.panel.setVisible(state.open);
    refresh(scene, state);
  };
  buttonBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    toggle();
  });
  closeBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    toggle(false);
  });
  panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());

  positionUi(scene, state);
  refresh(scene, state);
  return state;
}

export function installJobPanelPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
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
    if (population > state.lastPopulation) state.counts.gatherer += population - state.lastPopulation;
    if (population < state.lastPopulation) state.counts.gatherer = Math.max(0, state.counts.gatherer - (state.lastPopulation - population));
    if (population !== state.lastPopulation) {
      state.lastPopulation = population;
      applyWorkerJobs(this, state);
      refresh(this, state);
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
