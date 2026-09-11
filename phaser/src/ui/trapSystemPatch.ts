import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type TrapState = {
  sprite: Phaser.GameObjects.Image;
  stored: number;
  readyAt: number;
  busy: boolean;
  badge: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
};

type SceneState = {
  meat: number;
  fur: number;
  traps: TrapState[];
  workerBusy: WeakSet<Phaser.GameObjects.Image>;
};

const TRAP_CD_MS = 8000;
const TRAP_CAPACITY = 3;
const states = new WeakMap<BuildScene, SceneState>();

function getSceneState(scene: BuildScene): SceneState {
  let state = states.get(scene);
  if (!state) {
    state = { meat: 0, fur: 0, traps: [], workerBusy: new WeakSet() };
    states.set(scene, state);
  }
  return state;
}

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function getWorkers(scene: BuildScene): Phaser.GameObjects.Image[] {
  return getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
}

function refreshTrapBadge(scene: BuildScene, trap: TrapState): void {
  if (!trap.sprite.active || !trap.label.active) return;
  if (trap.stored >= TRAP_CAPACITY) {
    trap.label.setText(`陷阱 ${trap.stored}/${TRAP_CAPACITY} · 待回收`).setColor('#ffe19a');
    return;
  }
  const remain = Math.max(0, trap.readyAt - scene.time.now);
  trap.label
    .setText(trap.stored > 0 ? `陷阱 ${trap.stored}/${TRAP_CAPACITY} · ${Math.ceil(remain / 1000)}s` : `陷阱 ${Math.ceil(remain / 1000)}s`)
    .setColor('#e8eadb');
}

function createTrapBadge(scene: BuildScene, sprite: Phaser.GameObjects.Image): Pick<TrapState, 'badge' | 'label'> {
  const bg = scene.add.rectangle(sprite.x, sprite.y - 112, 190, 46, 0x283329, 0.92)
    .setStrokeStyle(2, 0x738567, 1);
  const label = scene.add.text(sprite.x, sprite.y - 112, '', {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '17px',
    color: '#e8eadb',
    fontStyle: 'bold',
  }).setOrigin(0.5);
  const badge = scene.add.container(0, 0, [bg, label]).setDepth(4400);
  const world = getPrivate<Phaser.GameObjects.Container>(scene, 'world');
  world?.add(badge);
  return { badge, label };
}

function registerTrap(scene: BuildScene, sprite: Phaser.GameObjects.Image): void {
  const state = getSceneState(scene);
  const ui = createTrapBadge(scene, sprite);
  const trap: TrapState = {
    sprite,
    stored: 0,
    readyAt: scene.time.now + TRAP_CD_MS,
    busy: false,
    badge: ui.badge,
    label: ui.label,
  };
  state.traps.push(trap);
  refreshTrapBadge(scene, trap);
}

function tickTraps(scene: BuildScene): void {
  const state = getSceneState(scene);
  for (const trap of state.traps) {
    if (!trap.sprite.active) continue;
    if (trap.stored < TRAP_CAPACITY && scene.time.now >= trap.readyAt) {
      trap.stored += 1;
      trap.readyAt = scene.time.now + TRAP_CD_MS;
      scene.tweens.add({ targets: trap.sprite, scaleX: trap.sprite.scaleX * 1.06, scaleY: trap.sprite.scaleY * 1.06, yoyo: true, duration: 100 });
    }
    refreshTrapBadge(scene, trap);
  }
}

function getCampPoint(scene: BuildScene): Phaser.Math.Vector2 {
  const gridToWorld = (scene as unknown as { gridToWorld?: (col: number, row: number) => Phaser.Math.Vector2 }).gridToWorld;
  if (gridToWorld) return gridToWorld.call(scene, 4, 3);
  return new Phaser.Math.Vector2(540, 580);
}

function deliverTrapLoot(scene: BuildScene, worker: Phaser.GameObjects.Image, trap: TrapState): void {
  const state = getSceneState(scene);
  const catches = trap.stored;
  if (catches <= 0) {
    trap.busy = false;
    state.workerBusy.delete(worker);
    return;
  }

  trap.stored = 0;
  trap.readyAt = scene.time.now + TRAP_CD_MS;
  const meatGain = catches * Phaser.Math.Between(2, 4);
  let furGain = 0;
  for (let i = 0; i < catches; i += 1) {
    if (Math.random() < 0.65) furGain += 1;
  }

  const camp = getCampPoint(scene);
  scene.tweens.add({
    targets: worker,
    x: camp.x + Phaser.Math.Between(55, 105),
    y: camp.y + Phaser.Math.Between(20, 55),
    angle: 0,
    duration: Phaser.Math.Between(1200, 1700),
    ease: 'Sine.InOut',
    onComplete: () => {
      state.meat += meatGain;
      state.fur += furGain;
      const refreshResources = (scene as unknown as { refreshResources?: () => void }).refreshResources;
      refreshResources?.call(scene);

      const popup = scene.add.text(worker.x, worker.y - 64, `+${meatGain} 肉${furGain > 0 ? `  +${furGain} 毛皮` : ''}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        color: '#ffe5b0',
        fontStyle: 'bold',
        stroke: '#3a3025',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6200);
      scene.tweens.add({ targets: popup, y: popup.y - 44, alpha: 0, duration: 900, onComplete: () => popup.destroy() });

      trap.busy = false;
      state.workerBusy.delete(worker);
      worker.clearTint();
    },
  });
}

function dispatchTrappers(scene: BuildScene): void {
  const state = getSceneState(scene);
  const readyTraps = state.traps.filter((trap) => trap.stored > 0 && !trap.busy && trap.sprite.active);
  if (readyTraps.length === 0) return;

  const trappers = getWorkers(scene).filter((worker) => worker.active && worker.getData('job') === 'trapper' && !state.workerBusy.has(worker));
  for (const worker of trappers) {
    const trap = readyTraps.shift();
    if (!trap) break;

    trap.busy = true;
    state.workerBusy.add(worker);
    scene.tweens.killTweensOf(worker);
    worker.setTint(0xd7c69a);
    scene.tweens.add({
      targets: worker,
      x: trap.sprite.x + Phaser.Math.Between(-28, 28),
      y: trap.sprite.y + 46,
      duration: Phaser.Math.Between(1100, 1600),
      ease: 'Sine.InOut',
      onComplete: () => {
        if (!worker.active || !trap.sprite.active) {
          trap.busy = false;
          state.workerBusy.delete(worker);
          return;
        }
        scene.tweens.add({ targets: worker, angle: -8, yoyo: true, repeat: 3, duration: 120 });
        scene.time.delayedCall(650, () => deliverTrapLoot(scene, worker, trap));
      },
    });
  }
}

export function installTrapSystemPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__trapSystemPatched) return;
  marker.__trapSystemPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  const originalPlaceBuilding = proto.placeBuilding;
  const originalRefreshResources = proto.refreshResources;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    getSceneState(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tickTraps(this);
    dispatchTrappers(this);
    return result;
  };

  proto.placeBuilding = function patchedPlaceBuilding(this: BuildScene, ...args: any[]) {
    const result = originalPlaceBuilding.apply(this, args);
    const def = args[0] as { id?: string } | undefined;
    if (def?.id === 'trap') {
      const placed = getPrivate<Array<{ id: string; sprite: Phaser.GameObjects.Image }>>(this, 'placed') ?? [];
      const latest = [...placed].reverse().find((building) => building.id === 'trap');
      if (latest && !getSceneState(this).traps.some((trap) => trap.sprite === latest.sprite)) registerTrap(this, latest.sprite);
    }
    return result;
  };

  proto.refreshResources = function patchedRefreshResources(this: BuildScene, ...args: any[]) {
    const result = originalRefreshResources.apply(this, args);
    const state = getSceneState(this);
    const text = getPrivate<Phaser.GameObjects.Text>(this, 'resourceText');
    const wood = Number(getPrivate<number>(this, 'wood') ?? 0);
    const population = Number(getPrivate<number>(this, 'population') ?? 0);
    const populationCap = Number(getPrivate<number>(this, 'populationCap') ?? 0);
    text?.setText(`木材 ${wood}   肉 ${state.meat}   毛皮 ${state.fur}   人口 ${population}/${populationCap}`);
    setPrivate(this, 'meat', state.meat);
    setPrivate(this, 'fur', state.fur);
    return result;
  };
}
