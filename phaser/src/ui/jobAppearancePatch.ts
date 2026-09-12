import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

const JOB_TEXTURE: Record<string, string> = {
  gatherer: 'worker',
  hunter: 'worker-hunter',
  explorer: 'worker-explorer',
  tanner: 'worker-tanner',
  charcutier: 'worker-charcutier',
};

function getWorkers(scene: BuildScene): Phaser.GameObjects.Image[] {
  return (scene as unknown as { workers?: Phaser.GameObjects.Image[] }).workers ?? [];
}

export function installJobAppearancePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__jobAppearancePatched) return;
  (proto as Record<string, unknown>).__jobAppearancePatched = true;

  const originalPreload = proto.preload;
  const originalUpdate = proto.update;

  proto.preload = function patchedPreload(this: BuildScene, ...args: any[]) {
    const result = originalPreload.apply(this, args);
    this.load.svg('worker-hunter', 'assets/workers/hunter.svg', { width: 96, height: 140 });
    this.load.svg('worker-explorer', 'assets/workers/explorer.svg', { width: 96, height: 140 });
    this.load.svg('worker-tanner', 'assets/workers/tanner.svg', { width: 96, height: 140 });
    this.load.svg('worker-charcutier', 'assets/workers/charcutier.svg', { width: 96, height: 140 });
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    for (const worker of getWorkers(this)) {
      if (!worker.active) continue;
      const job = String(worker.getData('job') ?? 'gatherer');
      const texture = JOB_TEXTURE[job] ?? 'worker';
      if (worker.texture.key !== texture) worker.setTexture(texture).setDisplaySize(54, 79);
    }
    return result;
  };
}
