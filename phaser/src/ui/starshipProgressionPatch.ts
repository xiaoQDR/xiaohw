import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { WORLD_TILE } from '../game/worldMap';

type AnyBuild = Phaser.Scene & Record<string, any>;
type AnyExpedition = Phaser.Scene & Record<string, any>;

type StarshipState = {
  hull: number;
  engine: number;
};

type UiState = {
  ship: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Text;
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  hullText: Phaser.GameObjects.Text;
  engineText: Phaser.GameObjects.Text;
  hullCostText: Phaser.GameObjects.Text;
  engineCostText: Phaser.GameObjects.Text;
  launchBg: Phaser.GameObjects.Rectangle;
  launchText: Phaser.GameObjects.Text;
  open: boolean;
};

const uiStates = new WeakMap<BuildScene, UiState>();

const HULL_COSTS = [
  { steel: 20, iron: 60 },
  { steel: 50, iron: 100 },
  { steel: 100, iron: 160 },
];

const ENGINE_COSTS = [
  { steel: 20, sulphur: 40 },
  { steel: 50, sulphur: 80 },
  { steel: 100, sulphur: 140 },
];

function getStarshipState(scene: AnyBuild): StarshipState {
  if (!scene.oldStarshipState) scene.oldStarshipState = { hull: 0, engine: 0 } satisfies StarshipState;
  return scene.oldStarshipState as StarshipState;
}

function hasResources(scene: AnyBuild, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([key, value]) => Number(scene[key] ?? 0) >= value);
}

function spend(scene: AnyBuild, cost: Record<string, number>): void {
  for (const [key, value] of Object.entries(cost)) scene[key] = Math.max(0, Number(scene[key] ?? 0) - value);
  scene.refreshResources?.call(scene);
}

function costLabel(cost: Record<string, number> | undefined): string {
  if (!cost) return '已完成';
  const names: Record<string, string> = { steel: '钢', iron: '铁', sulphur: '硫磺' };
  return Object.entries(cost).map(([key, value]) => `${names[key] ?? key} ${value}`).join(' · ');
}

function closePanel(state: UiState): void {
  state.open = false;
  state.panel.setVisible(false);
  state.shade.setVisible(false);
}

function refreshUi(scene: AnyBuild, state: UiState): void {
  const recovered = Boolean(scene.starshipRecovered);
  state.ship.setVisible(recovered);
  state.badge.setVisible(recovered);
  if (!recovered) return;

  const data = getStarshipState(scene);
  const ready = data.hull >= 3 && data.engine >= 3;
  state.badge.setText(ready ? 'OLD STARSHIP · 可起飞' : 'OLD STARSHIP · 修复中');
  state.hullText.setText(`船体等级  ${data.hull}/3`);
  state.engineText.setText(`引擎等级  ${data.engine}/3`);
  state.hullCostText.setText(data.hull >= 3 ? '船体已完成' : `升级消耗：${costLabel(HULL_COSTS[data.hull])}`);
  state.engineCostText.setText(data.engine >= 3 ? '引擎已完成' : `升级消耗：${costLabel(ENGINE_COSTS[data.engine])}`);
  state.launchBg.setFillStyle(ready ? 0x6f8e59 : 0x465048, 1);
  state.launchText.setText(ready ? '起飞' : '尚未完成修复');
}

function createPanel(scene: AnyBuild, ship: Phaser.GameObjects.Image, badge: Phaser.GameObjects.Text): UiState {
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x101511, 0.72).setOrigin(0).setDepth(14900).setVisible(false).setInteractive();
  const panel = scene.add.container(0, 0).setDepth(15000).setVisible(false);
  const bg = scene.add.rectangle(0, 0, 820, 960, 0x202720, 0.995).setStrokeStyle(3, 0x7d8e76, 1).setInteractive();
  const title = scene.add.text(-340, -410, 'OLD STARSHIP', { fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#f3ead4', fontStyle: 'bold' });
  const sub = scene.add.text(-340, -356, '从荒野拖回的坠毁星舰。修复船体与引擎后即可尝试起飞。', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#b8c3b0', wordWrap: { width: 680 } });
  const closeBg = scene.add.circle(340, -410, 30, 0x4a594b, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(340, -411, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);

  const hullCard = scene.add.rectangle(0, -150, 680, 210, 0x2b342c, 1).setStrokeStyle(1, 0x59665a, 1);
  const hullText = scene.add.text(-285, -215, '', { fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#edf1e8', fontStyle: 'bold' });
  const hullCostText = scene.add.text(-285, -165, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#c8d0c0' });
  const hullBtn = scene.add.rectangle(230, -145, 180, 62, 0x566e54, 1).setStrokeStyle(2, 0x879b7c, 1).setInteractive({ useHandCursor: true });
  const hullBtnText = scene.add.text(230, -145, '升级船体', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

  const engineCard = scene.add.rectangle(0, 100, 680, 210, 0x2b342c, 1).setStrokeStyle(1, 0x59665a, 1);
  const engineText = scene.add.text(-285, 35, '', { fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#edf1e8', fontStyle: 'bold' });
  const engineCostText = scene.add.text(-285, 85, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#c8d0c0' });
  const engineBtn = scene.add.rectangle(230, 105, 180, 62, 0x566e54, 1).setStrokeStyle(2, 0x879b7c, 1).setInteractive({ useHandCursor: true });
  const engineBtnText = scene.add.text(230, 105, '升级引擎', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

  const launchBg = scene.add.rectangle(0, 330, 420, 78, 0x465048, 1).setStrokeStyle(2, 0x829077, 1).setInteractive({ useHandCursor: true });
  const launchText = scene.add.text(0, 330, '尚未完成修复', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff4dc', fontStyle: 'bold' }).setOrigin(0.5);
  const footer = scene.add.text(0, 400, '起飞后将进入最终太空阶段。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#9eaa98' }).setOrigin(0.5);

  panel.add([bg, title, sub, closeBg, closeText, hullCard, hullText, hullCostText, hullBtn, hullBtnText, engineCard, engineText, engineCostText, engineBtn, engineBtnText, launchBg, launchText, footer]);

  const state: UiState = { ship, badge, panel, shade, title, hullText, engineText, hullCostText, engineCostText, launchBg, launchText, open: false };

  const openPanel = () => {
    if (!scene.starshipRecovered) return;
    state.open = true;
    shade.setVisible(true);
    panel.setVisible(true);
    refreshUi(scene, state);
  };

  ship.on('pointerdown', openPanel);
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); closePanel(state); });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());

  hullBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    const data = getStarshipState(scene);
    if (data.hull >= 3) return;
    const cost = HULL_COSTS[data.hull];
    if (!hasResources(scene, cost)) { scene.showToast?.('升级船体所需资源不足'); return; }
    spend(scene, cost);
    data.hull += 1;
    scene.showToast?.(`星舰船体升级到 ${data.hull} 级`);
    refreshUi(scene, state);
  });

  engineBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    const data = getStarshipState(scene);
    if (data.engine >= 3) return;
    const cost = ENGINE_COSTS[data.engine];
    if (!hasResources(scene, cost)) { scene.showToast?.('升级引擎所需资源不足'); return; }
    spend(scene, cost);
    data.engine += 1;
    scene.showToast?.(`星舰引擎升级到 ${data.engine} 级`);
    refreshUi(scene, state);
  });

  launchBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    const data = getStarshipState(scene);
    if (data.hull < 3 || data.engine < 3) { scene.showToast?.('星舰尚未完成修复'); return; }
    scene.starshipLaunchUnlocked = true;
    scene.showToast?.('起飞条件已经满足，太空飞行阶段即将接入');
  });

  return state;
}

function positionUi(scene: AnyBuild, state: UiState): void {
  const view = scene.cameras.main.worldView;
  state.shade.setPosition(view.left, view.top).setSize(view.width, view.height);
  state.panel.setPosition(view.centerX, view.centerY);
}

export function installStarshipProgressionPatch(): void {
  const buildProto = BuildScene.prototype as unknown as Record<string, any>;
  if (!buildProto.__starshipProgressionPatched) {
    buildProto.__starshipProgressionPatched = true;
    const originalPreload = buildProto.preload;
    const originalCreate = buildProto.create;
    const originalUpdate = buildProto.update;

    buildProto.preload = function patchedPreload(this: AnyBuild, ...args: any[]) {
      const result = originalPreload.apply(this, args);
      this.load.svg('old-starship', 'assets/buildings/old-starship.svg', { width: 420, height: 260 });
      return result;
    };

    buildProto.create = function patchedCreate(this: AnyBuild, ...args: any[]) {
      const result = originalCreate.apply(this, args);
      const world = this.world as Phaser.GameObjects.Container | undefined;
      const ship = this.add.image(860, 480, 'old-starship').setDisplaySize(320, 198).setDepth(520).setVisible(false).setInteractive({ useHandCursor: true });
      const badge = this.add.text(860, 350, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff0cf', fontStyle: 'bold', backgroundColor: '#2d3730', padding: { x: 12, y: 7 } }).setOrigin(0.5).setDepth(530).setVisible(false);
      world?.add([ship, badge]);
      const state = createPanel(this, ship, badge);
      uiStates.set(this as unknown as BuildScene, state);
      refreshUi(this, state);
      positionUi(this, state);
      return result;
    };

    buildProto.update = function patchedUpdate(this: AnyBuild, ...args: any[]) {
      const result = originalUpdate.apply(this, args);
      const state = uiStates.get(this as unknown as BuildScene);
      if (state) {
        refreshUi(this, state);
        positionUi(this, state);
      }
      return result;
    };
  }

  const expeditionProto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (!expeditionProto.__starshipRecoveryPatched) {
    expeditionProto.__starshipRecoveryPatched = true;
    const originalWinEncounter = expeditionProto.winEncounter;
    expeditionProto.winEncounter = function patchedWinEncounter(this: AnyExpedition) {
      const encounter = this.encounter ? { ...this.encounter } : undefined;
      originalWinEncounter.call(this);
      if (!encounter || encounter.tile !== WORLD_TILE.ship) return;
      const build = this.scene.get('build') as AnyBuild;
      build.starshipRecovered = true;
      getStarshipState(build);
      const state = uiStates.get(build as unknown as BuildScene);
      if (state) refreshUi(build, state);
      this.setMessage?.('坠毁星舰已经清理。你决定把它拖回营地，作为特殊设施继续修复。');
    };
  }
}
