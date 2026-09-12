import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'meat' | 'fur' | 'bait' | 'leather' | 'curedMeat' | 'scales' | 'teeth' | 'cloth' | 'charm' | 'medicine' | 'iron' | 'coal' | 'sulphur' | 'steel' | 'bullets';

type DebugState = {
  button?: Phaser.GameObjects.Container;
  panel?: Phaser.GameObjects.Container;
  valueTexts: Map<ResourceKey, Phaser.GameObjects.Text>;
  open: boolean;
};

const resources: Array<{ key: ResourceKey; label: string }> = [
  { key: 'wood', label: '木材' },
  { key: 'meat', label: '肉' },
  { key: 'fur', label: '毛皮' },
  { key: 'bait', label: '诱饵' },
  { key: 'leather', label: '皮革' },
  { key: 'curedMeat', label: '熏肉' },
  { key: 'scales', label: '鳞片' },
  { key: 'teeth', label: '牙齿' },
  { key: 'cloth', label: '布料' },
  { key: 'charm', label: '护符' },
  { key: 'medicine', label: '药剂' },
  { key: 'iron', label: '铁' },
  { key: 'coal', label: '煤' },
  { key: 'sulphur', label: '硫磺' },
  { key: 'steel', label: '钢' },
  { key: 'bullets', label: '子弹' },
];

const states = new WeakMap<BuildScene, DebugState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function getResource(scene: BuildScene, key: ResourceKey): number {
  return Number(getPrivate<number>(scene, key) ?? 0);
}

function setResource(scene: BuildScene, key: ResourceKey, value: number): void {
  setPrivate(scene, key, Math.max(0, Number.isFinite(value) ? value : 0));
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function refreshPanel(scene: BuildScene, state: DebugState): void {
  for (const item of resources) state.valueTexts.get(item.key)?.setText(String(getResource(scene, item.key)));
}

function updatePosition(scene: BuildScene, state: DebugState): void {
  const view = scene.cameras.main.worldView;
  state.button?.setPosition(view.right - 150, view.top + 196);
  state.panel?.setPosition(view.centerX, view.centerY);
}

function openNumericEditor(scene: BuildScene, state: DebugState, key: ResourceKey, label: string): void {
  const current = getResource(scene, key);
  const input = window.prompt(`设置${label}数量`, String(current));
  if (input == null) return;
  const parsed = Number(input.trim());
  if (!Number.isFinite(parsed)) {
    (scene as unknown as { showToast?: (message: string) => void }).showToast?.('请输入有效数字');
    return;
  }
  setResource(scene, key, parsed);
  refreshPanel(scene, state);
}

function createUi(scene: BuildScene): DebugState {
  const state: DebugState = { valueTexts: new Map(), open: false };

  const buttonBg = scene.add.rectangle(0, 0, 250, 66, 0x4c2d2d, 0.97)
    .setStrokeStyle(2, 0xb88172, 1)
    .setInteractive({ useHandCursor: true });
  const buttonLabel = scene.add.text(0, 0, 'DEBUG 资源', {
    fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff1dc', fontStyle: 'bold',
  }).setOrigin(0.5);
  state.button = scene.add.container(0, 0, [buttonBg, buttonLabel]).setDepth(9850);

  const panel = scene.add.container(0, 0).setDepth(11000).setVisible(false);
  state.panel = panel;
  const shade = scene.add.rectangle(0, 0, 1300, 2100, 0x111511, 0.72).setInteractive();
  const bg = scene.add.rectangle(0, 0, 900, 1420, 0x202720, 0.995).setStrokeStyle(3, 0x7c8d72, 1).setInteractive();
  const title = scene.add.text(-370, -655, 'DEBUG · 资源设置', {
    fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff2d9', fontStyle: 'bold',
  });
  const hint = scene.add.text(-370, -607, '点击中间数值可直接输入；+100 用于快速测试。', {
    fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebca5',
  });
  const closeBg = scene.add.circle(370, -645, 30, 0x4a594b, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(370, -646, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
  panel.add([shade, bg, title, hint, closeBg, closeText]);

  resources.forEach((item, index) => {
    const col = index < 8 ? 0 : 1;
    const row = index % 8;
    const baseX = col === 0 ? -225 : 225;
    const y = -520 + row * 145;
    const rowBg = scene.add.rectangle(baseX, y, 390, 116, 0x2b342c, 1).setStrokeStyle(1, 0x526052, 1);
    const name = scene.add.text(baseX - 165, y - 34, item.label, {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#e5ecd9', fontStyle: 'bold',
    });
    const valueBg = scene.add.rectangle(baseX - 35, y + 20, 180, 52, 0x3a463b, 1)
      .setStrokeStyle(1, 0x768575, 1)
      .setInteractive({ useHandCursor: true });
    const value = scene.add.text(baseX - 35, y + 20, '0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#fff0b4', fontStyle: 'bold',
    }).setOrigin(0.5);
    const plus = scene.add.rectangle(baseX + 120, y + 20, 95, 52, 0x4b654b, 1)
      .setStrokeStyle(1, 0x789276, 1)
      .setInteractive({ useHandCursor: true });
    const plusText = scene.add.text(baseX + 120, y + 20, '+100', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    state.valueTexts.set(item.key, value);
    valueBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      openNumericEditor(scene, state, item.key, item.label);
    });
    plus.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      setResource(scene, item.key, getResource(scene, item.key) + 100);
      refreshPanel(scene, state);
    });
    panel.add([rowBg, name, valueBg, value, plus, plusText]);
  });

  const setOpen = (open: boolean) => {
    state.open = open;
    panel.setVisible(open);
    if (open) refreshPanel(scene, state);
  };

  buttonBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    setOpen(!state.open);
  });
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    setOpen(false);
  });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());

  updatePosition(scene, state);
  return state;
}

export function installDebugResourcePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__debugResourcePatched) return;
  marker.__debugResourcePatched = true;

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
    if (state) {
      updatePosition(this, state);
      if (state.open) refreshPanel(this, state);
    }
    return result;
  };
}
