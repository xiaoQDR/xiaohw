import Phaser from 'phaser';

export const COLORS = {
  bg: 0x0c0d0f,
  panel: 0x15171a,
  panelAlt: 0x1d2024,
  line: 0x3a3f45,
  text: '#e6e1d8',
  dim: '#898a86',
  ember: '#d9824b',
  emberHex: 0xd9824b,
  danger: '#d65f5f',
  good: '#8fa876',
};

export function label(scene: Phaser.Scene, x: number, y: number, value: string, size = 28, color = COLORS.text): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, value, {
    fontFamily: 'Noto Sans SC, Microsoft YaHei, sans-serif',
    fontSize: `${size}px`,
    color,
    lineSpacing: 8,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  }).setOrigin(0, 0.5);

  // 1080px 的设计坐标在手机上会被缩小。只放大文字，不改变面板布局，
  // 让正文在窄屏上仍然可读，同时避免标题显得过重。
  const readabilityScale = size <= 22 ? 1.7 : size <= 29 ? 1.5 : 1.25;
  return text.setScale(readabilityScale);
}

export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, color = COLORS.panel): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, width, height, color, 1)
    .setStrokeStyle(2, COLORS.line, 1);
}

export interface ButtonParts {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  setEnabled: (enabled: boolean) => void;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
  onClick: () => void,
): ButtonParts {
  const bg = scene.add.rectangle(0, 0, width, height, COLORS.panelAlt)
    .setStrokeStyle(2, COLORS.line);
  const text = label(scene, 0, 0, value, 25).setOrigin(0.5);
  const hitArea = scene.add.zone(0, 0, width, Math.max(height, 120))
    .setInteractive({ useHandCursor: true });
  const root = scene.add.container(x, y, [bg, text, hitArea]);
  let enabled = true;

  const release = () => {
    root.setScale(1);
    bg.setFillStyle(COLORS.panelAlt);
  };

  hitArea.on('pointerover', () => enabled && bg.setFillStyle(0x292d32));
  hitArea.on('pointerout', release);
  hitArea.on('pointerupoutside', release);
  hitArea.on('pointerdown', () => enabled && root.setScale(0.97));
  hitArea.on('pointerup', () => {
    release();
    if (enabled) onClick();
  });

  return {
    root, bg, text,
    setEnabled(next: boolean) {
      enabled = next;
      bg.setAlpha(next ? 1 : 0.42);
      text.setAlpha(next ? 1 : 0.42);
      if (!next) release();
    },
  };
}

export function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.floor(value).toString();
}
