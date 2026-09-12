import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';

type AnyExpedition = Phaser.Scene & Record<string, any>;
type ControlPair = { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Rectangle };
type LayoutState = { arrows: Map<string, ControlPair>; returnPair?: ControlPair; resize: () => void };

const states = new WeakMap<ExpeditionScene, LayoutState>();

function nearestInteractiveRectangle(scene: AnyExpedition, text: Phaser.GameObjects.Text): Phaser.GameObjects.Rectangle | undefined {
  let best: Phaser.GameObjects.Rectangle | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const object of scene.children.list) {
    if (!(object instanceof Phaser.GameObjects.Rectangle) || !object.input?.enabled) continue;
    const dx = object.x - text.x;
    const dy = object.y - text.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = object;
    }
  }
  return bestDistance <= 25 ? best : undefined;
}

function collectControls(scene: AnyExpedition): LayoutState {
  const arrows = new Map<string, ControlPair>();
  let returnPair: ControlPair | undefined;
  for (const object of scene.children.list) {
    if (!(object instanceof Phaser.GameObjects.Text)) continue;
    const value = object.text;
    if (['↑', '←', '↓', '→'].includes(value)) {
      const bg = nearestInteractiveRectangle(scene, object);
      if (bg) arrows.set(value, { text: object, bg });
    } else if (value === '返回营地') {
      const bg = nearestInteractiveRectangle(scene, object);
      if (bg) returnPair = { text: object, bg };
    }
  }
  const resize = () => positionMobileControls(scene, arrows, returnPair);
  return { arrows, returnPair, resize };
}

function setPair(pair: ControlPair | undefined, x: number, y: number): void {
  if (!pair) return;
  pair.bg.setPosition(x, y);
  pair.text.setPosition(x, y);
}

function positionMobileControls(scene: AnyExpedition, arrows: Map<string, ControlPair>, returnPair?: ControlPair): void {
  const width = scene.scale.width;
  const height = scene.scale.height;
  if (width >= 620) return;

  const centerX = Math.max(105, Math.min(width * 0.32, 175));
  const baseY = height - 70;
  setPair(arrows.get('↑'), centerX, baseY - 68);
  setPair(arrows.get('←'), centerX - 82, baseY);
  setPair(arrows.get('↓'), centerX, baseY);
  setPair(arrows.get('→'), centerX + 82, baseY);
  setPair(returnPair, width - 112, height - 192);

  const message = scene.messageText as Phaser.GameObjects.Text | undefined;
  message?.setPosition(20, height - 272).setWordWrapWidth(Math.max(250, width - 40));
}

export function installExpeditionResponsivePatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__expeditionResponsivePatched) return;
  proto.__expeditionResponsivePatched = true;

  const originalCreate = proto.create;
  const originalLayoutEncounter = proto.layoutEncounterPanel;

  proto.layoutEncounterPanel = function patchedEncounterLayout(this: AnyExpedition) {
    originalLayoutEncounter.call(this);
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const panel = this.encounterPanel as Phaser.GameObjects.Container | undefined;
    const backdrop = this.encounterBackdrop as Phaser.GameObjects.Rectangle | undefined;
    backdrop?.setPosition(0, 0).setSize(width, height);
    if (!panel) return;
    const scale = Math.min(1, (width - 28) / 760, (height - 150) / 520);
    panel.setScale(Math.max(0.34, scale)).setPosition(width / 2, height / 2);
  };

  proto.create = function patchedCreate(this: AnyExpedition, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    const state = collectControls(this);
    states.set(this as unknown as ExpeditionScene, state);
    this.scale.on('resize', state.resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', state.resize));
    state.resize();
    return result;
  };
}
