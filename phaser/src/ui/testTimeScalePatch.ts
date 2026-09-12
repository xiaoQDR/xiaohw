import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type SpeedState = { index: number; virtualNow: number; lastRawNow: number };

const SPEEDS = [1, 5, 20] as const;
const states = new WeakMap<BuildScene, SpeedState>();

function getState(scene: BuildScene): SpeedState {
  let state = states.get(scene);
  if (!state) {
    const now = scene.time.now;
    state = { index: 0, virtualNow: now, lastRawNow: now };
    states.set(scene, state);
  }
  return state;
}

function applySpeed(scene: BuildScene, state: SpeedState): void {
  const speed = SPEEDS[state.index];
  scene.time.timeScale = speed;
  scene.tweens.timeScale = speed;
  scene.anims.globalTimeScale = speed;
}

function advanceVirtualTime(scene: BuildScene, state: SpeedState): void {
  const rawNow = scene.time.now;
  let rawDelta = rawNow - state.lastRawNow;
  if (!Number.isFinite(rawDelta) || rawDelta < 0 || rawDelta > 1000) rawDelta = 0;
  state.virtualNow += rawDelta * SPEEDS[state.index];
  state.lastRawNow = rawNow;
  scene.time.now = state.virtualNow;
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
    const state = getState(this);
    state.virtualNow = this.time.now;
    state.lastRawNow = this.time.now;
    applySpeed(this, state);

    const anyScene = this as unknown as Record<string, unknown>;
    anyScene.getTestSpeed = () => SPEEDS[getState(this).index];
    anyScene.cycleTestSpeed = () => {
      const current = getState(this);
      current.index = (current.index + 1) % SPEEDS.length;
      applySpeed(this, current);
      return SPEEDS[current.index];
    };
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const state = getState(this);
    advanceVirtualTime(this, state);
    return originalUpdate.apply(this, args);
  };
}
