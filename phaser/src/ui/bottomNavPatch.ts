import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type TabId = 'build' | 'inventory' | 'expedition';
type NavState = {
  bar: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  buttons: Record<TabId, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }>;
  buildOpen: boolean;
  buildProgress: number;
};

const NAV_H = 104;
const BUILD_MENU_H = 430;
const states = new WeakMap<BuildScene, NavState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function closeBuild(state: NavState): void {
  state.buildOpen = false;
}

function setSelected(state: NavState, selected: TabId | null): void {
  (Object.keys(state.buttons) as TabId[]).forEach((id) => {
    const active = id === selected;
    state.buttons[id].bg.setFillStyle(active ? 0x536b4d : 0x2d382f, 1);
    state.buttons[id].text.setColor(active ? '#fff2ce' : '#c3cdbb');
  });
}

function openInventory(scene: BuildScene, state: NavState): void {
  closeBuild(state);
  setSelected(state, 'inventory');
  getPrivate<() => void>(scene, 'openInventoryPanel')?.();
}

function openExpedition(scene: BuildScene, state: NavState): void {
  closeBuild(state);
  setSelected(state, 'expedition');
  getPrivate<() => void>(scene, 'openExpeditionCamp')?.();
}

function toggleBuild(state: NavState): void {
  state.buildOpen = !state.buildOpen;
  setSelected(state, state.buildOpen ? 'build' : null);
}

function createButton(scene: BuildScene, label: string): { container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const bg = scene.add.rectangle(0, 0, 260, 74, 0x2d382f, 1)
    .setStrokeStyle(2, 0x708166, 1)
    .setInteractive({ useHandCursor: true });
  const text = scene.add.text(0, 0, label, {
    fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#c3cdbb', fontStyle: 'bold',
  }).setOrigin(0.5);
  return { container: scene.add.container(0, 0, [bg, text]), bg, text };
}

function createNav(scene: BuildScene): NavState {
  const bar = scene.add.container(0, 0).setDepth(10050);
  const bg = scene.add.rectangle(0, 0, 1, NAV_H, 0x1f2721, 0.995).setStrokeStyle(2, 0x617057, 1).setInteractive();
  const build = createButton(scene, '建造');
  const inventory = createButton(scene, '背包');
  const expedition = createButton(scene, '远征');
  bar.add([bg, build.container, inventory.container, expedition.container]);

  const state: NavState = {
    bar, bg,
    buttons: {
      build: { bg: build.bg, text: build.text },
      inventory: { bg: inventory.bg, text: inventory.text },
      expedition: { bg: expedition.bg, text: expedition.text },
    },
    buildOpen: false,
    buildProgress: 0,
  };
  states.set(scene, state);

  build.bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggleBuild(state);
  });
  inventory.bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    openInventory(scene, state);
  });
  expedition.bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    openExpedition(scene, state);
  });
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());

  const tavern = getPrivate<Phaser.GameObjects.Image>(scene, 'treeSprite');
  tavern?.removeAllListeners('pointerdown');
  tavern?.disableInteractive();
  getPrivate<Phaser.GameObjects.Text>(scene, 'treeStatus')?.setText('酒馆').setColor('#f5e7a6');

  const buildMenu = getPrivate<Phaser.GameObjects.Container>(scene, 'menu');
  buildMenu?.setVisible(false);
  setSelected(state, null);
  layout(scene, state, true);
  return state;
}

function layout(scene: BuildScene, state: NavState, snap = false): void {
  const view = scene.cameras.main.worldView;
  const width = view.width;
  const target = state.buildOpen ? 1 : 0;
  state.buildProgress = snap ? target : Phaser.Math.Linear(state.buildProgress, target, 0.24);
  if (Math.abs(state.buildProgress - target) < 0.01) state.buildProgress = target;

  state.bar.setPosition(view.left, view.bottom - NAV_H);
  state.bg.setPosition(width / 2, NAV_H / 2).setSize(width, NAV_H);

  const buttonW = Math.min(290, Math.max(190, (width - 72) / 3));
  const gap = 14;
  const total = buttonW * 3 + gap * 2;
  const startX = (width - total) / 2 + buttonW / 2;
  const ids: TabId[] = ['build', 'inventory', 'expedition'];
  ids.forEach((id, index) => {
    const button = state.buttons[id].bg;
    button.setSize(buttonW, 74);
    const container = button.parentContainer;
    container?.setPosition(startX + index * (buttonW + gap), NAV_H / 2);
  });

  const buildMenu = getPrivate<Phaser.GameObjects.Container>(scene, 'menu');
  if (buildMenu) {
    const visible = state.buildProgress > 0.01;
    buildMenu.setVisible(visible);
    const openY = view.bottom - BUILD_MENU_H;
    buildMenu.y = openY + (1 - state.buildProgress) * BUILD_MENU_H;
  }
}

export function installBottomNavPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__bottomNavPatched) return;
  (proto as Record<string, unknown>).__bottomNavPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    createNav(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) layout(this, state);
    return result;
  };
}
