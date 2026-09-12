import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyBuild = Phaser.Scene & Record<string, any>;
type Recipe = {
  name: string;
  description: string;
  cost: Record<string, number>;
  craft: (scene: AnyBuild) => void;
};
type UiState = {
  machine: Phaser.GameObjects.Container;
  badge: Phaser.GameObjects.Text;
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  open: boolean;
};

const states = new WeakMap<BuildScene, UiState>();
const RESOURCE_NAME: Record<string, string> = {
  wood: '木材', leather: '皮革', cloth: '布料', scales: '鳞片', steel: '钢', sulphur: '硫磺',
};

function addResource(scene: AnyBuild, key: string, amount: number): void {
  scene[key] = Math.max(0, Number(scene[key] ?? 0) + amount);
}
function addCrafted(scene: AnyBuild, key: string, amount: number): void {
  if (!scene.craftedItems) scene.craftedItems = {};
  scene.craftedItems[key] = Math.max(0, Number(scene.craftedItems[key] ?? 0) + amount);
}
function canAfford(scene: AnyBuild, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([key, amount]) => Number(scene[key] ?? 0) >= amount);
}
function spend(scene: AnyBuild, cost: Record<string, number>): void {
  for (const [key, amount] of Object.entries(cost)) scene[key] = Math.max(0, Number(scene[key] ?? 0) - amount);
}
function costLabel(cost: Record<string, number>): string {
  return Object.entries(cost).map(([key, amount]) => `${RESOURCE_NAME[key] ?? key} ${amount}`).join(' · ');
}
function finishCraft(scene: AnyBuild, message: string): void {
  scene.refreshResources?.call(scene);
  scene.refreshExpeditionInventory?.();
  scene.refreshInventoryPanel?.();
  scene.saveGameNow?.call(scene);
  scene.showToast?.(message);
}

const RECIPES: Recipe[] = [
  {
    name: '医用合成',
    description: '制造 5 份药剂',
    cost: { cloth: 20, scales: 10 },
    craft: (scene) => { addResource(scene, 'medicine', 5); finishCraft(scene, '制造机：药剂 +5'); },
  },
  {
    name: '精密弹药',
    description: '制造 30 发子弹',
    cost: { steel: 10, sulphur: 10 },
    craft: (scene) => { addResource(scene, 'bullets', 30); finishCraft(scene, '制造机：子弹 +30'); },
  },
  {
    name: '钢制护甲',
    description: '制造 1 套钢甲',
    cost: { steel: 80, leather: 100 },
    craft: (scene) => { addCrafted(scene, 'sArmour', 1); finishCraft(scene, '制造机：钢甲 +1'); },
  },
  {
    name: '精修步枪',
    description: '制造 1 把步枪',
    cost: { steel: 50, wood: 200 },
    craft: (scene) => { addCrafted(scene, 'rifle', 1); finishCraft(scene, '制造机：步枪 +1'); },
  },
];

function createMachine(scene: AnyBuild): { machine: Phaser.GameObjects.Container; badge: Phaser.GameObjects.Text } {
  const base = scene.add.rectangle(0, 10, 170, 92, 0x4c5960, 1).setStrokeStyle(3, 0x74838a, 1);
  const tower = scene.add.rectangle(0, -42, 112, 72, 0x65727a, 1).setStrokeStyle(2, 0x8b989e, 1);
  const core = scene.add.circle(0, -42, 21, 0x91c1b2, 1).setStrokeStyle(4, 0xd0e6de, 1);
  const legL = scene.add.rectangle(-58, 62, 25, 38, 0x3d474b, 1);
  const legR = scene.add.rectangle(58, 62, 25, 38, 0x3d474b, 1);
  const machine = scene.add.container(185, 555, [legL, legR, base, tower, core]).setDepth(525).setVisible(false).setSize(190, 165).setInteractive({ useHandCursor: true });
  const badge = scene.add.text(185, 445, '制造机 · 战舰回收设施', {
    fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#eaf4ee', fontStyle: 'bold',
    backgroundColor: '#34413d', padding: { x: 10, y: 6 },
  }).setOrigin(0.5).setDepth(530).setVisible(false);
  const world = scene.world as Phaser.GameObjects.Container | undefined;
  world?.add([machine, badge]);
  scene.tweens.add({ targets: core, alpha: 0.55, yoyo: true, repeat: -1, duration: 900 });
  return { machine, badge };
}

function createUi(scene: AnyBuild): UiState {
  const { machine, badge } = createMachine(scene);
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x101511, 0.72).setOrigin(0).setDepth(15100).setVisible(false).setInteractive();
  const panel = scene.add.container(0, 0).setDepth(15200).setVisible(false);
  const bg = scene.add.rectangle(0, 0, 790, 850, 0x20282a, 0.995).setStrokeStyle(3, 0x74858a, 1).setInteractive();
  const title = scene.add.text(-330, -365, '制造机', { fontFamily: 'system-ui, sans-serif', fontSize: '36px', color: '#eef5f1', fontStyle: 'bold' });
  const sub = scene.add.text(-330, -315, '从受创战舰回收的制造设备，可快速生产高级远征物资。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebdb6' });
  const closeBg = scene.add.circle(325, -365, 28, 0x465357, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(325, -366, '×', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
  panel.add([bg, title, sub, closeBg, closeText]);

  RECIPES.forEach((recipe, index) => {
    const y = -220 + index * 145;
    const row = scene.add.rectangle(0, y, 670, 118, 0x2d3738, 1).setStrokeStyle(1, 0x566466, 1);
    const name = scene.add.text(-290, y - 38, recipe.name, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#edf4ef', fontStyle: 'bold' });
    const desc = scene.add.text(-290, y - 5, recipe.description, { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#a9b7b0' });
    const cost = scene.add.text(-290, y + 25, `消耗：${costLabel(recipe.cost)}`, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#d6c995' });
    const craftBg = scene.add.rectangle(255, y, 120, 52, 0x55705f, 1).setStrokeStyle(1, 0x839589, 1).setInteractive({ useHandCursor: true });
    const craftText = scene.add.text(255, y, '制造', { fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    craftBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (!canAfford(scene, recipe.cost)) { scene.showToast?.('制造所需资源不足'); return; }
      spend(scene, recipe.cost);
      recipe.craft(scene);
    });
    panel.add([row, name, desc, cost, craftBg, craftText]);
  });

  const state: UiState = { machine, badge, panel, shade, open: false };
  const setOpen = (open: boolean) => {
    state.open = open;
    shade.setVisible(open);
    panel.setVisible(open);
  };
  machine.on('pointerdown', () => setOpen(true));
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); setOpen(false); });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  return state;
}

function refresh(scene: AnyBuild, state: UiState): void {
  const visible = Boolean(scene.fabricatorUnlocked);
  state.machine.setVisible(visible);
  state.badge.setVisible(visible);
  if (!visible && state.open) {
    state.open = false;
    state.shade.setVisible(false);
    state.panel.setVisible(false);
  }
  const view = scene.cameras.main.worldView;
  state.shade.setPosition(view.left, view.top).setSize(view.width, view.height);
  state.panel.setPosition(view.centerX, view.centerY);
}

export function installFabricatorPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, any>;
  if (proto.__fabricatorPatched) return;
  proto.__fabricatorPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: AnyBuild, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    const state = createUi(this);
    states.set(this as unknown as BuildScene, state);
    refresh(this, state);
    return result;
  };
  proto.update = function patchedUpdate(this: AnyBuild, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this as unknown as BuildScene);
    if (state) refresh(this, state);
    return result;
  };
}
