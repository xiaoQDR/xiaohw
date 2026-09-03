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
  return scene.add.text(x, y, value, {
    fontFamily: 'Noto Sans SC, Microsoft YaHei, sans-serif',
    fontSize: `${size}px`,
    color,
    lineSpacing: 8,
  }).setOrigin(0, 0.5);
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
    .setStrokeStyle(2, COLORS.line)
    .setInteractive({ useHandCursor: true });
  const text = label(scene, 0, 0, value, 25).setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, text]);
  let enabled = true;

  bg.on('pointerover', () => enabled && bg.setFillStyle(0x292d32));
  bg.on('pointerout', () => enabled && bg.setFillStyle(COLORS.panelAlt));
  bg.on('pointerdown', () => enabled && root.setScale(0.97));
  bg.on('pointerup', () => {
    root.setScale(1);
    if (enabled) onClick();
  });

  return {
    root, bg, text,
    setEnabled(next: boolean) {
      enabled = next;
      bg.setAlpha(next ? 1 : 0.42);
      text.setAlpha(next ? 1 : 0.42);
      if (!next) root.setScale(1);
    },
  };
}

export function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.floor(value).toString();
}
