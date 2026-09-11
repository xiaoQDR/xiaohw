import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type SpeedState = {
  index: number;
  button?: Phaser.GameObjects.Container;
  label?: Phaser.GameObjects.Text;
};

const SPEEDS = [1, 5, 20] as const;
const states = new WeakMap<BuildScene, SpeedState>();

function getState(scene: BuildScene): SpeedState {
  let state = states.get(scene);
  if (!state) {
    state = { index: 0 };
    states.set(scene, state);
  }
  return state;
}

function applySpeed(scene: BuildScene, state: SpeedState): void {
  const speed = SPEEDS[state.index];
  scene.time.timeScale = speed;
  scene.tweens.timeScale = speed;
  scene.anims.globalTimeScale = speed;
  state.label?.setText(`测试加速 ×${speed}`);
}

function createButton(scene: BuildScene): void {
  const state = getState(scene);
  const bg = scene.add.rectangle(0, 0, 250, 66, 0x26352b, 0.96)
    .setStrokeStyle(2, 0x879b7a, 1)
    .setInteractive({ useHandCursor: true });
  const label = scene.add.text(0, 0, '', {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '22px',
    color: '#fff2d6',
    fontStyle: 'bold',
  }).setOrigin(0.5);
  const button = scene.add.container(0, 0, [bg, label]).setDepth(9800);
  state.button = button;
  state.label = label;

  bg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    state.index = (state.index + 1) % SPEEDS.length;
    applySpeed(scene, state);
    const toast = (scene as unknown as { showToast?: (message: string) => void }).showToast;
    toast?.call(scene, `测试时间速度：×${SPEEDS[state.index]}`);
  });

  applySpeed(scene, state);
  updateButtonPosition(scene);
}

function updateButtonPosition(scene: BuildScene): void {
  const state = getState(scene);
  if (!state.button) return;
  const view = scene.cameras.main.worldView;
  state.button.setPosition(view.right - 155, view.top + 118);
}

export function installTestTimeScalePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__testTimeScalePatched) return;
  marker.__testTimeScalePatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    createButton(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    updateButtonPosition(this);
    return result;
  };
}
