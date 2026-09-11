import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'meat' | 'fur' | 'bait' | 'scales' | 'teeth' | 'cloth' | 'charm' | 'leather' | 'curedMeat';

type TrapState = {
  sprite: Phaser.GameObjects.Image;
  readyAt: number;
  ready: boolean;
  busy: boolean;
  badge: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
};

type SceneState = {
  traps: TrapState[];
  workerBusy: WeakSet<Phaser.GameObjects.Image>;
};

const TRAP_CD_MS = 90_000;
const states = new WeakMap<BuildScene, SceneState>();

const DROP_TABLE: Array<{ under: number; key: ResourceKey; name: string }> = [
  { under: 0.50, key: 'fur', name: '毛皮' },
  { under: 0.75, key: 'meat', name: '肉' },
  { under: 0.85, key: 'scales', name: '鳞片' },
  { under: 0.93, key: 'teeth', name: '牙齿' },
  { under: 0.995, key: 'cloth', name: '布料' },
  { under: 1.0, key: 'charm', name: '护符' },
];

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

function getState(scene: BuildScene): SceneState {
  let state = states.get(scene);
  if (!state) {
    state = { traps: [], workerBusy: new WeakSet() };
    states.set(scene, state);
  }
  return state;
}

function showToast(scene: BuildScene, message: string): void {
  const fn = (scene as unknown as { showToast?: (text: string) => void }).showToast;
  fn?.call(scene, message);
}

function refreshResources(scene: BuildScene): void {
  const fn = (scene as unknown as { refreshResources?: () => void }).refreshResources;
  fn?.call(scene);
}

function getWorkers(scene: BuildScene): Phaser.GameObjects.Image[] {
  return getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
}

function refreshTrapBadge(scene: BuildScene, trap: TrapState): void {
  if (!trap.sprite.active || !trap.label.active) return;
  if (trap.busy) {
    trap.label.setText('陷阱 · 回收中').setColor('#ffd58a');
    return;
  }
  if (trap.ready) {
    trap.label.setText('陷阱 · 点击回收').setColor('#ffe19a');
    return;
  }
  const remain = Math.max(0, trap.readyAt - scene.time.now);
  trap.label.setText(`陷阱 ${Math.ceil(remain / 1000)}s`).setColor('#e8eadb');
}

function createTrapBadge(scene: BuildScene, sprite: Phaser.GameObjects.Image): Pick<TrapState, 'badge' | 'label'> {
  const bg = scene.add.rectangle(sprite.x, sprite.y - 112, 206, 46, 0x283329, 0.92).setStrokeStyle(2, 0x738567, 1);
  const label = scene.add.text(sprite.x, sprite.y - 112, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#e8eadb', fontStyle: 'bold',
  }).setOrigin(0.5);
  const badge = scene.add.container(0, 0, [bg, label]).setDepth(4400);
  getPrivate<Phaser.GameObjects.Container>(scene, 'world')?.add(badge);
  return { badge, label };
}

function rollDrop(): { key: ResourceKey; name: string } {
  const roll = Math.random();
  return DROP_TABLE.find((drop) => roll < drop.under) ?? DROP_TABLE[DROP_TABLE.length - 1];
}

function removeTrap(scene: BuildScene, trap: TrapState): void {
  const state = getState(scene);
  state.traps = state.traps.filter((candidate) => candidate !== trap);

  const placed = getPrivate<Array<{ id: string; col: number; row: number; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  const index = placed.findIndex((building) => building.sprite === trap.sprite);
  if (index >= 0) {
    const building = placed[index];
    getPrivate<Set<string>>(scene, 'occupied')?.delete(`${building.col},${building.row}`);
    placed.splice(index, 1);
  }

  trap.badge.destroy(true);
  trap.sprite.destroy();
}

function collectTrap(scene: BuildScene, trap: TrapState, worker?: Phaser.GameObjects.Image): void {
  if (!trap.ready || !trap.sprite.active) return;

  const drops = new Map<ResourceKey, number>();
  const addRoll = () => {
    const drop = rollDrop();
    drops.set(drop.key, (drops.get(drop.key) ?? 0) + 1);
  };

  addRoll();
  if (getResource(scene, 'bait') >= 1) {
    addResource(scene, 'bait', -1);
    addRoll();
  }

  for (const [key, amount] of drops) addResource(scene, key, amount);
  refreshResources(scene);

  const text = [...drops.entries()]
    .map(([key, amount]) => {
      const label = DROP_TABLE.find((drop) => drop.key === key)?.name ?? key;
      return `+${amount} ${label}`;
    })
    .join('  ');
  const x = worker?.x ?? trap.sprite.x;
  const y = (worker?.y ?? trap.sprite.y) - 64;
  const popup = scene.add.text(x, y, text, {
    fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffe5b0', fontStyle: 'bold',
    stroke: '#3a3025', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(6200);
  scene.tweens.add({ targets: popup, y: popup.y - 44, alpha: 0, duration: 900, onComplete: () => popup.destroy() });

  removeTrap(scene, trap);
  showToast(scene, '陷阱已回收');
}

function collectTrapManually(scene: BuildScene, trap: TrapState): void {
  if (trap.busy) {
    showToast(scene, '陷阱师正在回收这个陷阱');
    return;
  }
  if (!trap.ready) {
    const remain = Math.max(0, trap.readyAt - scene.time.now);
    showToast(scene, `陷阱还没有猎物，还需 ${Math.ceil(remain / 1000)} 秒`);
    return;
  }
  collectTrap(scene, trap);
}

function registerTrap(scene: BuildScene, sprite: Phaser.GameObjects.Image): void {
  const ui = createTrapBadge(scene, sprite);
  const trap: TrapState = {
    sprite,
    readyAt: scene.time.now + TRAP_CD_MS,
    ready: false,
    busy: false,
    badge: ui.badge,
    label: ui.label,
  };
  getState(scene).traps.push(trap);
  sprite.setInteractive({ useHandCursor: true });
  sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    collectTrapManually(scene, trap);
  });
  refreshTrapBadge(scene, trap);
}

function tickTraps(scene: BuildScene): void {
  for (const trap of getState(scene).traps) {
    if (!trap.sprite.active) continue;
    if (!trap.ready && scene.time.now >= trap.readyAt) {
      trap.ready = true;
      scene.tweens.add({ targets: trap.sprite, scaleX: trap.sprite.scaleX * 1.06, scaleY: trap.sprite.scaleY * 1.06, yoyo: true, duration: 100 });
    }
    refreshTrapBadge(scene, trap);
  }
}

function getCampPoint(scene: BuildScene): Phaser.Math.Vector2 {
  const fn = (scene as unknown as { gridToWorld?: (col: number, row: number) => Phaser.Math.Vector2 }).gridToWorld;
  return fn ? fn.call(scene, 4, 3) : new Phaser.Math.Vector2(540, 580);
}

function dispatchTrappers(scene: BuildScene): void {
  const state = getState(scene);
  const ready = state.traps.filter((trap) => trap.ready && !trap.busy && trap.sprite.active);
  if (ready.length === 0) return;

  const trappers = getWorkers(scene).filter((worker) => worker.active && worker.getData('job') === 'trapper' && !state.workerBusy.has(worker));
  for (const worker of trappers) {
    const trap = ready.shift();
    if (!trap) break;
    trap.busy = true;
    state.workerBusy.add(worker);
    scene.tweens.killTweensOf(worker);
    worker.setTint(0xd7c69a);
    refreshTrapBadge(scene, trap);
    scene.tweens.add({
      targets: worker,
      x: trap.sprite.x + Phaser.Math.Between(-28, 28),
      y: trap.sprite.y + 46,
      duration: Phaser.Math.Between(1100, 1600),
      ease: 'Sine.InOut',
      onComplete: () => {
        if (!worker.active || !trap.sprite.active) {
          state.workerBusy.delete(worker);
          return;
        }
        scene.time.delayedCall(650, () => {
          const camp = getCampPoint(scene);
          scene.tweens.add({
            targets: worker,
            x: camp.x + Phaser.Math.Between(55, 105),
            y: camp.y + Phaser.Math.Between(20, 55),
            duration: Phaser.Math.Between(1200, 1700),
            ease: 'Sine.InOut',
            onComplete: () => {
              collectTrap(scene, trap, worker);
              state.workerBusy.delete(worker);
              worker.clearTint();
            },
          });
        });
      },
    });
  }
}

function formatResourceLine(scene: BuildScene): string {
  const wood = Number(getPrivate<number>(scene, 'wood') ?? 0);
  const population = Number(getPrivate<number>(scene, 'population') ?? 0);
  const populationCap = Number(getPrivate<number>(scene, 'populationCap') ?? 0);
  const primary = `木材 ${wood}   肉 ${getResource(scene, 'meat')}   毛皮 ${getResource(scene, 'fur')}   人口 ${population}/${populationCap}`;
  const extras: string[] = [];
  const labels: Array<[ResourceKey, string]> = [
    ['bait', '诱饵'], ['leather', '皮革'], ['curedMeat', '熏肉'], ['scales', '鳞片'], ['teeth', '牙齿'], ['cloth', '布料'], ['charm', '护符'],
  ];
  for (const [key, label] of labels) {
    const value = getResource(scene, key);
    if (value > 0) extras.push(`${label} ${value}`);
  }
  return extras.length > 0 ? `${primary}\n${extras.join('   ')}` : primary;
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
    for (const key of ['meat', 'fur', 'bait', 'scales', 'teeth', 'cloth', 'charm', 'leather', 'curedMeat']) {
      if (getPrivate<number>(this, key) == null) setPrivate(this, key, 0);
    }
    getState(this);
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
      if (latest && !getState(this).traps.some((trap) => trap.sprite === latest.sprite)) registerTrap(this, latest.sprite);
    }
    return result;
  };

  proto.refreshResources = function patchedRefreshResources(this: BuildScene, ...args: any[]) {
    const result = originalRefreshResources.apply(this, args);
    getPrivate<Phaser.GameObjects.Text>(this, 'resourceText')?.setText(formatResourceLine(this));
    return result;
  };
}
