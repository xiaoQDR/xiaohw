import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type ChromeState = {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  resource: Phaser.GameObjects.Text;
};

const TOP_H = 148;
const MENU_H = 430;
const states = new WeakMap<BuildScene, ChromeState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}
function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function layout(scene: BuildScene): void {
  const view = scene.cameras.main.worldView;
  const topBar = getPrivate<Phaser.GameObjects.Container>(scene, 'topBar');
  const menu = getPrivate<Phaser.GameObjects.Container>(scene, 'menu');
  const state = states.get(scene);

  if (topBar && state) {
    topBar.setPosition(view.left, view.top).setDepth(5000);
    state.bg.setPosition(view.width / 2, TOP_H / 2).setSize(view.width, TOP_H);
    state.title.setPosition(42, 42);
    state.resource.setPosition(view.width - 42, 52);
  }
  if (menu) menu.setPosition(view.left, view.bottom - MENU_H).setDepth(5000);
}

export function installResponsiveChromePatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__responsiveChromePatched) return;
  (proto as Record<string, unknown>).__responsiveChromePatched = true;

  proto.createTopBar = function patchedCreateTopBar(this: BuildScene) {
    const topBar = this.add.container(0, 0).setDepth(5000);
    const bg = this.add.rectangle(0, TOP_H / 2, 1, TOP_H, 0x263126, 0.96);
    const title = this.add.text(42, 42, '小黑屋 · 营地', {
      fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#f4f0df', fontStyle: 'bold',
    });
    const resource = this.add.text(0, 52, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#efe6c8',
      wordWrap: { width: 650, useAdvancedWrap: true },
      align: 'right',
    }).setOrigin(1, 0);
    topBar.add([bg, title, resource]);
    setPrivate(this, 'topBar', topBar);
    setPrivate(this, 'resourceText', resource);
    states.set(this, { bg, title, resource });
    layout(this);
  };

  proto.updateUiAnchors = function patchedUpdateUiAnchors(this: BuildScene) {
    layout(this);
  };

  const originalResize = proto.resizeViewport;
  proto.resizeViewport = function patchedResizeViewport(this: BuildScene, ...args: any[]) {
    const result = originalResize.apply(this, args);
    layout(this);
    return result;
  };
}
