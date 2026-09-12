import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
const SPEED_FACTOR = 1.55;

function workers(scene: BuildScene): Phaser.GameObjects.Image[] {
  return (scene as unknown as { workers?: Phaser.GameObjects.Image[] }).workers ?? [];
}

function containsWorker(scene: BuildScene, targets: unknown): boolean {
  const list = Array.isArray(targets) ? targets : [targets];
  const current = workers(scene);
  return list.some((target) => current.includes(target as Phaser.GameObjects.Image));
}

export function installWorkerMovementSpeedPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__workerMovementSpeedPatched) return;
  (proto as Record<string, unknown>).__workerMovementSpeedPatched = true;

  const originalCreate = proto.create;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    const manager = this.tweens as unknown as { add: (config: Phaser.Types.Tweens.TweenBuilderConfig) => Phaser.Tweens.Tween };
    const originalAdd = manager.add.bind(manager);
    manager.add = (config: Phaser.Types.Tweens.TweenBuilderConfig) => {
      if (!containsWorker(this, config.targets) || typeof config.duration !== 'number') return originalAdd(config);
      return originalAdd({ ...config, duration: Math.round(config.duration * SPEED_FACTOR) });
    };
    return result;
  };
}
