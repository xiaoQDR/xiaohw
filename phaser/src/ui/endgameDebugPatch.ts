import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyBuild = Phaser.Scene & Record<string, any>;

type State = {
  button: Phaser.GameObjects.Container;
};

const states = new WeakMap<BuildScene, State>();

function unlockEndgame(scene: AnyBuild): void {
  scene.starshipRecovered = true;
  scene.oldStarshipState = { hull: 3, engine: 3 };
  scene.starshipLaunchUnlocked = true;
  scene.claimedMineTypes = { iron: true, coal: true, sulphur: true };
  scene.iron = Math.max(1000, Number(scene.iron ?? 0));
  scene.coal = Math.max(1000, Number(scene.coal ?? 0));
  scene.sulphur = Math.max(1000, Number(scene.sulphur ?? 0));
  scene.steel = Math.max(1000, Number(scene.steel ?? 0));
  scene.refreshResources?.call(scene);
  scene.refreshBuildMenuNow?.();
  scene.saveGameNow?.call(scene);
  scene.showToast?.('终局测试已解锁：Old Starship 已满级，可直接起飞');
}

function createButton(scene: AnyBuild): State {
  const bg = scene.add.rectangle(0, 0, 196, 58, 0x4c5968, 0.98)
    .setStrokeStyle(2, 0x8292a1, 1)
    .setInteractive({ useHandCursor: true });
  const text = scene.add.text(0, 0, '终局测试', {
    fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#eef5fa', fontStyle: 'bold',
  }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [bg, text]).setDepth(9850);
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    unlockEndgame(scene);
  });
  return { button };
}

function position(scene: BuildScene, state: State): void {
  const view = scene.cameras.main.worldView;
  state.button.setPosition(view.right - 112, view.centerY + 126);
}

export function installEndgameDebugPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, any>;
  if (proto.__endgameDebugPatched) return;
  proto.__endgameDebugPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    const state = createButton(this as unknown as AnyBuild);
    states.set(this, state);
    position(this, state);
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) position(this, state);
    return result;
  };
}
