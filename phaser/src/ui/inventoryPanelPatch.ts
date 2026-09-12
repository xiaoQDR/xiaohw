import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type InventoryState = {
  button: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  listText: Phaser.GameObjects.Text;
  open: boolean;
};

const states = new WeakMap<BuildScene, InventoryState>();
const ITEMS: Array<{ id: string; name: string; group: string }> = [
  { id: 'torch', name: '火把', group: '工具' },
  { id: 'waterskin', name: '水袋', group: '水具' }, { id: 'cask', name: '水桶', group: '水具' }, { id: 'waterTank', name: '水箱', group: '水具' },
  { id: 'rucksack', name: '帆布包', group: '行囊' }, { id: 'wagon', name: '货车', group: '行囊' }, { id: 'convoy', name: '车队', group: '行囊' },
  { id: 'lArmour', name: '皮甲', group: '护甲' }, { id: 'iArmour', name: '铁甲', group: '护甲' }, { id: 'sArmour', name: '钢甲', group: '护甲' },
  { id: 'boneSpear', name: '骨矛', group: '武器' }, { id: 'ironSword', name: '铁剑', group: '武器' }, { id: 'steelSword', name: '钢剑', group: '武器' }, { id: 'rifle', name: '步枪', group: '武器' },
];

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}
function crafted(scene: BuildScene): Record<string, number> {
  return getPrivate<Record<string, number>>(scene, 'craftedItems') ?? {};
}
function refresh(scene: BuildScene, state: InventoryState): void {
  const owned = crafted(scene);
  const groups = ['工具', '水具', '行囊', '护甲', '武器'];
  const lines: string[] = [];
  for (const group of groups) {
    const entries = ITEMS.filter((item) => item.group === group && Number(owned[item.id] ?? 0) > 0);
    lines.push(group);
    if (entries.length === 0) lines.push('  暂无');
    else for (const item of entries) lines.push(`  ${item.name}  ×${Number(owned[item.id] ?? 0)}`);
    lines.push('');
  }
  lines.push('消耗品');
  lines.push(`  熏肉  ×${Number(getPrivate<number>(scene, 'curedMeat') ?? 0)}`);
  lines.push(`  药剂  ×${Number(getPrivate<number>(scene, 'medicine') ?? 0)}`);
  lines.push(`  子弹  ×${Number(getPrivate<number>(scene, 'bullets') ?? 0)}`);
  state.listText.setText(lines.join('\n'));
}
function layout(scene: BuildScene, state: InventoryState): void {
  const view = scene.cameras.main.worldView;
  state.button.setPosition(view.right - 112, view.centerY - 25);
  state.panel.setPosition(view.centerX, view.centerY);
  state.shade.setPosition(0, 0).setSize(view.width + 12, view.height + 12);
}
function createUi(scene: BuildScene): InventoryState {
  const buttonBg = scene.add.rectangle(0, 0, 196, 64, 0x3d4c40, 0.98).setStrokeStyle(2, 0x899a7e, 1).setInteractive({ useHandCursor: true });
  const buttonText = scene.add.text(0, 0, '背包', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff1d7', fontStyle: 'bold' }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [buttonBg, buttonText]).setDepth(9840);

  const panel = scene.add.container(0, 0).setDepth(11900).setVisible(false);
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x111511, 0.72).setInteractive();
  const bg = scene.add.rectangle(0, 0, 780, 1160, 0x202820, 0.995).setStrokeStyle(3, 0x819173, 1).setInteractive();
  const title = scene.add.text(-325, -520, '背包 · 装备库存', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff0d2', fontStyle: 'bold' });
  const sub = scene.add.text(-325, -475, '工坊制作出的装备会保存在这里，远征时从这里选择。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebba5' });
  const listText = scene.add.text(-315, -420, '', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#dfe7d5', lineSpacing: 8 });
  const closeBg = scene.add.circle(325, -510, 30, 0x4b5849, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(325, -511, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
  panel.add([shade, bg, title, sub, listText, closeBg, closeText]);

  const state: InventoryState = { button, panel, shade, listText, open: false };
  const setOpen = (open: boolean) => { state.open = open; panel.setVisible(open); if (open) refresh(scene, state); };
  buttonBg.on('pointerdown', (_p, _x, _y, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); setOpen(!state.open); });
  closeBg.on('pointerdown', (_p, _x, _y, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); setOpen(false); });
  shade.on('pointerdown', (_p, _x, _y, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  bg.on('pointerdown', (_p, _x, _y, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  refresh(scene, state);
  layout(scene, state);
  return state;
}

export function installInventoryPanelPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__inventoryPanelPatched) return;
  (proto as Record<string, unknown>).__inventoryPanelPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    states.set(this, createUi(this));
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) { layout(this, state); if (state.open) refresh(this, state); }
    return result;
  };
}
