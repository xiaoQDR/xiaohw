import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';
import { getLastWorldTileCoordinates, WORLD_TILE } from '../game/worldMap';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'meat' | 'fur' | 'bait' | 'leather' | 'curedMeat' | 'scales' | 'teeth' | 'cloth' | 'charm' | 'medicine' | 'iron' | 'coal' | 'sulphur' | 'steel' | 'bullets';
type DebugState = {
  button: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  valueTexts: Map<ResourceKey, Phaser.GameObjects.Text>;
  speedText: Phaser.GameObjects.Text;
  open: boolean;
};

const resources: Array<{ key: ResourceKey; label: string }> = [
  { key: 'wood', label: '木材' }, { key: 'meat', label: '肉' }, { key: 'fur', label: '毛皮' }, { key: 'bait', label: '诱饵' },
  { key: 'leather', label: '皮革' }, { key: 'curedMeat', label: '熏肉' }, { key: 'scales', label: '鳞片' }, { key: 'teeth', label: '牙齿' },
  { key: 'cloth', label: '布料' }, { key: 'charm', label: '护符' }, { key: 'medicine', label: '药剂' }, { key: 'iron', label: '铁' },
  { key: 'coal', label: '煤' }, { key: 'sulphur', label: '硫磺' }, { key: 'steel', label: '钢' }, { key: 'bullets', label: '子弹' },
];

const states = new WeakMap<BuildScene, DebugState>();
function getPrivate<T>(scene: BuildScene, key: string): T | undefined { return (scene as unknown as Record<string, unknown>)[key] as T | undefined; }
function setPrivate(scene: BuildScene, key: string, value: unknown): void { (scene as unknown as Record<string, unknown>)[key] = value; }
function getResource(scene: BuildScene, key: ResourceKey): number { return Number(getPrivate<number>(scene, key) ?? 0); }
function refreshBuildMenu(scene: BuildScene): void { getPrivate<() => void>(scene, 'refreshBuildMenuNow')?.(); }
function refreshLinkedPanels(scene: BuildScene): void {
  getPrivate<() => void>(scene, 'refreshExpeditionInventory')?.();
  getPrivate<() => void>(scene, 'refreshInventoryPanel')?.();
}
function setResource(scene: BuildScene, key: ResourceKey, value: number): void {
  setPrivate(scene, key, Math.max(0, Number.isFinite(value) ? value : 0));
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
  refreshBuildMenu(scene);
}
function testSpeed(scene: BuildScene): number { return Number(getPrivate<() => number>(scene, 'getTestSpeed')?.() ?? 1); }
function cycleSpeed(scene: BuildScene): number { return Number(getPrivate<() => number>(scene, 'cycleTestSpeed')?.() ?? 1); }
function refreshPanel(scene: BuildScene, state: DebugState): void {
  for (const item of resources) state.valueTexts.get(item.key)?.setText(String(getResource(scene, item.key)));
  state.speedText.setText(`×${testSpeed(scene)}`);
}
function updatePosition(scene: BuildScene, state: DebugState): void {
  const view = scene.cameras.main.worldView;
  state.button.setPosition(view.right - 112, view.centerY + 55);
  state.panel.setPosition(view.centerX, view.centerY);
  state.shade.setPosition(0, 0).setSize(view.width + 12, view.height + 12);
}
function openNumericEditor(scene: BuildScene, state: DebugState, key: ResourceKey, label: string): void {
  const input = window.prompt(`设置${label}数量`, String(getResource(scene, key)));
  if (input == null) return;
  const parsed = Number(input.trim());
  if (!Number.isFinite(parsed)) {
    (scene as unknown as { showToast?: (message: string) => void }).showToast?.('请输入有效数字');
    return;
  }
  setResource(scene, key, parsed);
  refreshPanel(scene, state);
}
function addCombatTestLoadout(scene: BuildScene, state: DebugState): void {
  setResource(scene, 'curedMeat', getResource(scene, 'curedMeat') + 100);
  setResource(scene, 'medicine', getResource(scene, 'medicine') + 30);
  setResource(scene, 'bullets', getResource(scene, 'bullets') + 200);

  let craftedItems = getPrivate<Record<string, number>>(scene, 'craftedItems');
  if (!craftedItems) {
    craftedItems = {};
    setPrivate(scene, 'craftedItems', craftedItems);
  }
  const testGear = ['waterTank', 'convoy', 'sArmour', 'rifle', 'steelSword'];
  for (const id of testGear) craftedItems[id] = Math.max(1, Number(craftedItems[id] ?? 0));

  refreshLinkedPanels(scene);
  refreshPanel(scene, state);
  (scene as unknown as { showToast?: (message: string) => void }).showToast?.('已补齐远征战斗测试装备与补给');
}
function showShipCoordinates(scene: BuildScene): void {
  const ship = getLastWorldTileCoordinates(WORLD_TILE.ship)[0];
  const wreck = getLastWorldTileCoordinates(WORLD_TILE.executioner)[0];
  const showToast = (scene as unknown as { showToast?: (message: string) => void }).showToast;
  if (!ship && !wreck) {
    showToast?.call(scene, '世界地图尚未生成，请先进入一次远征');
    return;
  }
  const parts: string[] = [];
  if (ship) parts.push(`坠毁星舰 W：${ship.x}, ${ship.y}`);
  if (wreck) parts.push(`受创战舰 X：${wreck.x}, ${wreck.y}`);
  showToast?.call(scene, parts.join('   '));
}
function createUi(scene: BuildScene): DebugState {
  const buttonBg = scene.add.rectangle(0, 0, 196, 64, 0x38443a, 0.98).setStrokeStyle(2, 0x829276, 1).setInteractive({ useHandCursor: true });
  const buttonLabel = scene.add.text(0, 0, '测试工具', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff1dc', fontStyle: 'bold' }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [buttonBg, buttonLabel]).setDepth(9850);

  const panel = scene.add.container(0, 0).setDepth(11000).setVisible(false);
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x111511, 0.72).setInteractive();
  const bg = scene.add.rectangle(0, 0, 900, 1500, 0x202720, 0.995).setStrokeStyle(3, 0x7c8d72, 1).setInteractive();
  const title = scene.add.text(-370, -700, '测试工具', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff2d9', fontStyle: 'bold' });
  const hint = scene.add.text(-370, -656, '资源快速修改 + 时间倍率统一放在这里。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebca5' });
  const closeBg = scene.add.circle(370, -690, 30, 0x4a594b, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(370, -691, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);

  const speedRow = scene.add.rectangle(0, -590, 760, 78, 0x2b342c, 1).setStrokeStyle(1, 0x526052, 1);
  const speedLabel = scene.add.text(-330, -603, '时间加速', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#e5ecd9', fontStyle: 'bold' });
  const speedBg = scene.add.rectangle(275, -590, 150, 50, 0x536a50, 1).setStrokeStyle(1, 0x809476, 1).setInteractive({ useHandCursor: true });
  const speedText = scene.add.text(275, -590, '×1', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
  panel.add([shade, bg, title, hint, closeBg, closeText, speedRow, speedLabel, speedBg, speedText]);

  const valueTexts = new Map<ResourceKey, Phaser.GameObjects.Text>();
  const state: DebugState = { button, panel, shade, valueTexts, speedText, open: false };
  resources.forEach((item, index) => {
    const col = index < 8 ? 0 : 1;
    const row = index % 8;
    const baseX = col === 0 ? -225 : 225;
    const y = -490 + row * 135;
    const rowBg = scene.add.rectangle(baseX, y, 390, 106, 0x2b342c, 1).setStrokeStyle(1, 0x526052, 1);
    const name = scene.add.text(baseX - 165, y - 31, item.label, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#e5ecd9', fontStyle: 'bold' });
    const valueBg = scene.add.rectangle(baseX - 35, y + 18, 180, 48, 0x3a463b, 1).setStrokeStyle(1, 0x768575, 1).setInteractive({ useHandCursor: true });
    const value = scene.add.text(baseX - 35, y + 18, '0', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff0b4', fontStyle: 'bold' }).setOrigin(0.5);
    const plus = scene.add.rectangle(baseX + 120, y + 18, 105, 48, 0x4b654b, 1).setStrokeStyle(1, 0x789276, 1).setInteractive({ useHandCursor: true });
    const plusText = scene.add.text(baseX + 120, y + 18, '+1000', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    valueTexts.set(item.key, value);
    valueBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); openNumericEditor(scene, state, item.key, item.label); });
    plus.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); setResource(scene, item.key, getResource(scene, item.key) + 1000); refreshPanel(scene, state); });
    panel.add([rowBg, name, valueBg, value, plus, plusText]);
  });

  const combatBg = scene.add.rectangle(-195, 610, 370, 64, 0x6a553c, 1).setStrokeStyle(2, 0xa98a61, 1).setInteractive({ useHandCursor: true });
  const combatText = scene.add.text(-195, 610, '一键远征战斗测试', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff0cf', fontStyle: 'bold' }).setOrigin(0.5);
  const shipBg = scene.add.rectangle(195, 610, 370, 64, 0x465b66, 1).setStrokeStyle(2, 0x7692a0, 1).setInteractive({ useHandCursor: true });
  const shipText = scene.add.text(195, 610, '显示星舰坐标', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#e9f3f7', fontStyle: 'bold' }).setOrigin(0.5);
  panel.add([combatBg, combatText, shipBg, shipText]);

  const setOpen = (open: boolean) => { state.open = open; panel.setVisible(open); if (open) refreshPanel(scene, state); };
  buttonBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); setOpen(!state.open); });
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); setOpen(false); });
  speedBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    const speed = cycleSpeed(scene);
    refreshPanel(scene, state);
    (scene as unknown as { showToast?: (message: string) => void }).showToast?.(`测试时间速度：×${speed}`);
  });
  combatBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    addCombatTestLoadout(scene, state);
  });
  shipBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    showShipCoordinates(scene);
  });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  updatePosition(scene, state);
  return state;
}

export function installDebugResourcePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__debugResourcePatched) return;
  (proto as Record<string, unknown>).__debugResourcePatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) { const result = originalCreate.apply(this, args); states.set(this, createUi(this)); return result; };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) { updatePosition(this, state); if (state.open) refreshPanel(this, state); }
    return result;
  };
}
