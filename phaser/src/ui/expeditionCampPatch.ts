import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ExpeditionState = {
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  open: boolean;
  recruited: boolean;
  populationText: Phaser.GameObjects.Text;
  teamText: Phaser.GameObjects.Text;
  recruitText: Phaser.GameObjects.Text;
  recruitBg: Phaser.GameObjects.Rectangle;
  departBg: Phaser.GameObjects.Rectangle;
  departText: Phaser.GameObjects.Text;
};

const states = new WeakMap<BuildScene, ExpeditionState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function showToast(scene: BuildScene, text: string): void {
  (scene as unknown as { showToast?: (message: string) => void }).showToast?.(text);
}

function availableGatherers(scene: BuildScene): number {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  return workers.filter((worker) => worker.active && String(worker.getData('job') ?? 'gatherer') === 'gatherer').length;
}

function refresh(scene: BuildScene, state: ExpeditionState): void {
  const population = Number(getPrivate<number>(scene, 'population') ?? 0);
  const available = availableGatherers(scene);
  state.populationText.setText(`人口 ${population}    可征召 ${available}`);
  state.teamText.setText(`远征队  ${state.recruited ? '1 / 1' : '0 / 1'}`);
  state.recruitText.setText(state.recruited ? '取消征召' : '征召 1 人');
  state.recruitBg.setFillStyle(state.recruited ? 0x5a4a3b : (available > 0 ? 0x526a4d : 0x454c45), 1);
  const canDepart = state.recruited;
  state.departBg.setFillStyle(canDepart ? 0x6b7f4c : 0x454c45, 1);
  state.departText.setColor(canDepart ? '#fff4d6' : '#9ca59a');
}

function layout(scene: BuildScene, state: ExpeditionState): void {
  const view = scene.cameras.main.worldView;
  state.panel.setPosition(view.centerX, view.centerY);
  state.shade.setPosition(0, 0).setSize(view.width + 8, view.height + 8);
}

function setOpen(scene: BuildScene, open: boolean): void {
  const state = states.get(scene);
  if (!state) return;
  state.open = open;
  state.panel.setVisible(open);
  if (open) refresh(scene, state);
}

function createPanel(scene: BuildScene): ExpeditionState {
  const panel = scene.add.container(0, 0).setDepth(12500).setVisible(false);
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x101410, 0.74).setInteractive();
  const bg = scene.add.rectangle(0, 0, 900, 1260, 0x202820, 0.995).setStrokeStyle(3, 0x829270, 1).setInteractive();
  const title = scene.add.text(-370, -555, '酒馆 · 远征准备', {
    fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#fff0d2', fontStyle: 'bold',
  });
  const sub = scene.add.text(-370, -505, '从营地征召队员，准备补给与装备后进入荒野。', {
    fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#aebba5',
  });
  const populationText = scene.add.text(-370, -450, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#dbe4d0', fontStyle: 'bold',
  });

  const teamBg = scene.add.rectangle(0, -330, 760, 150, 0x2b352c, 1).setStrokeStyle(2, 0x536453, 1);
  const teamTitle = scene.add.text(-335, -380, '远征队', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff4d9', fontStyle: 'bold' });
  const teamText = scene.add.text(-335, -330, '', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#f1dc9d', fontStyle: 'bold' });
  const recruitBg = scene.add.rectangle(265, -330, 190, 58, 0x526a4d, 1).setStrokeStyle(1, 0x819374, 1).setInteractive({ useHandCursor: true });
  const recruitText = scene.add.text(265, -330, '征召 1 人', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

  const supplyBg = scene.add.rectangle(0, -80, 760, 280, 0x2b352c, 1).setStrokeStyle(2, 0x536453, 1);
  const supplyTitle = scene.add.text(-335, -190, '远征补给', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff4d9', fontStyle: 'bold' });
  const supplyText = scene.add.text(-335, -140,
    '食物：待配置\n饮水：待配置\n武器：待配置\n护甲：待配置\n背包：待配置',
    { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#b9c6af', lineSpacing: 12 },
  );

  const noteBg = scene.add.rectangle(0, 190, 760, 150, 0x273027, 1).setStrokeStyle(1, 0x4f604f, 1);
  const note = scene.add.text(-335, 145,
    '第一阶段先开放酒馆远征入口。下一步会接入真实队员、装备负重、食物/水消耗和世界地图。',
    { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#9faf98', wordWrap: { width: 670 }, lineSpacing: 7 },
  );

  const departBg = scene.add.rectangle(0, 355, 360, 72, 0x454c45, 1).setStrokeStyle(2, 0x7a8c70, 1).setInteractive({ useHandCursor: true });
  const departText = scene.add.text(0, 355, '出发', { fontFamily: 'system-ui, sans-serif', fontSize: '27px', color: '#9ca59a', fontStyle: 'bold' }).setOrigin(0.5);
  const closeBg = scene.add.circle(370, -545, 30, 0x4b5849, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(370, -546, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);

  panel.add([shade, bg, title, sub, populationText, teamBg, teamTitle, teamText, recruitBg, recruitText, supplyBg, supplyTitle, supplyText, noteBg, note, departBg, departText, closeBg, closeText]);

  const state: ExpeditionState = { panel, shade, open: false, recruited: false, populationText, teamText, recruitText, recruitBg, departBg, departText };
  states.set(scene, state);

  recruitBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    if (!state.recruited && availableGatherers(scene) <= 0) {
      showToast(scene, '没有可征召的闲置人口');
      return;
    }
    state.recruited = !state.recruited;
    refresh(scene, state);
  });
  departBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    if (!state.recruited) {
      showToast(scene, '先征召 1 名远征队员');
      return;
    }
    showToast(scene, '远征世界地图将在下一阶段接入');
  });
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); setOpen(scene, false); });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());

  setPrivate(scene, 'openExpeditionCamp', () => setOpen(scene, true));
  layout(scene, state);
  refresh(scene, state);
  return state;
}

export function installExpeditionCampPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__expeditionCampPatched) return;
  (proto as Record<string, unknown>).__expeditionCampPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    createPanel(this);
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) {
      layout(this, state);
      if (state.open) refresh(this, state);
    }
    return result;
  };
}
