import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type WorkerLabel = {
  text: Phaser.GameObjects.Text;
  number: number;
};

const labels = new WeakMap<Phaser.GameObjects.Image, WorkerLabel>();
let nextWorkerNumber = 1;

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function ensureLabel(scene: BuildScene, worker: Phaser.GameObjects.Image): WorkerLabel {
  let label = labels.get(worker);
  if (label) return label;
  const existing = Number(worker.getData('workerNumber') ?? 0);
  const number = existing > 0 ? existing : nextWorkerNumber++;
  worker.setData('workerNumber', number);
  const text = scene.add.text(worker.x, worker.y - worker.displayHeight * 0.66, String(number), {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '18px',
    color: '#fff7d6',
    fontStyle: 'bold',
    backgroundColor: '#263126',
    padding: { x: 7, y: 3 },
  }).setOrigin(0.5).setDepth(7600);
  getPrivate<Phaser.GameObjects.Container>(scene, 'world')?.add(text);
  label = { text, number };
  labels.set(worker, label);
  return label;
}

function syncLabels(scene: BuildScene): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  for (const worker of workers) {
    if (!worker.active) continue;
    const label = ensureLabel(scene, worker);
    label.text
      .setText(String(label.number))
      .setPosition(worker.x, worker.y - worker.displayHeight * 0.66)
      .setVisible(worker.visible)
      .setDepth(worker.depth + 30);
  }
}

export function installWorkerIdentityPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__workerIdentityPatched) return;
  marker.__workerIdentityPatched = true;

  const originalUpdate = proto.update;
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    syncLabels(this);
    return result;
  };
}
