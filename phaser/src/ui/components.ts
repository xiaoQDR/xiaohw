import Phaser from 'phaser';

export const COLORS = {
  bg: 0xffffff,
  panel: 0xffffff,
  panelAlt: 0xffffff,
  line: 0x111111,
  text: '#111111',
  dim: '#666666',
  ember: '#111111',
  emberHex: 0x111111,
  danger: '#8f2626',
  good: '#355f35',
};

const LEGACY_FONT = '"Times New Roman", "Songti SC", SimSun, serif';

interface CooldownVisualState {
  totalMs: number;
  readyAt: number;
}

const cooldownStates = new Map<string, CooldownVisualState>();

function parseCooldown(value: string): { display: string; seconds: number } | null {
  const match = value.match(/\s*·\s*(\d+)s(?:\s|$)/);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return {
    display: value.replace(match[0], '').replace(/\s{2,}/g, ' ').trim(),
    seconds,
  };
}

export function label(scene: Phaser.Scene, x: number, y: number, value: string, size = 28, color = COLORS.text): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, value, {
    fontFamily: LEGACY_FONT,
    fontSize: `${size}px`,
    fontStyle: 'normal',
    color,
    lineSpacing: 6,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  }).setOrigin(0, 0.5);

  // 保留移动端可读性，但不再使用现代无衬线字体和过重字号。
  const readabilityScale = size <= 22 ? 1.55 : size <= 29 ? 1.35 : 1.15;
  return text.setScale(readabilityScale);
}

export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, _color = COLORS.panel): Phaser.GameObjects.Rectangle {
  // 原版主体并不是卡片式 UI。保留矩形只作为现有 Phaser 排版容器，视觉上融入白底。
  return scene.add.rectangle(x, y, width, height, COLORS.panel, 1);
}

export interface ButtonParts {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  cooldown: Phaser.GameObjects.Rectangle;
  setEnabled: (enabled: boolean) => void;
  setCooldown: (remainingSeconds: number, totalSeconds?: number) => void;
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
  const parsed = parseCooldown(value);
  const shownValue = parsed?.display ?? value;

  // 原版 Button.js：1px 黑框、透明/白底，冷却层位于按钮内部并从 100% 线性缩到 0%。
  const cooldown = scene.add.rectangle(-width / 2, 0, 0, height, 0xdddddd, 1)
    .setOrigin(0, 0.5);
  const bg = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setStrokeStyle(1, COLORS.line, 1);
  const text = label(scene, 0, 0, shownValue, 24, COLORS.text).setOrigin(0.5);
  const hitArea = scene.add.zone(0, 0, width, Math.max(height, 96))
    .setInteractive({ useHandCursor: true });
  const root = scene.add.container(x, y, [cooldown, bg, text, hitArea]);
  let enabled = true;
  let cooldownTween: Phaser.Tweens.Tween | null = null;

  const key = `${scene.sys.settings.key}:${Math.round(x)}:${Math.round(y)}:${shownValue.replace(/\d+/g, '#')}`;

  const release = () => {
    text.setStyle({ textDecoration: 'none' });
  };

  const setCooldown = (remainingSeconds: number, totalSeconds = remainingSeconds) => {
    cooldownTween?.stop();
    cooldownTween = null;
    if (remainingSeconds <= 0 || totalSeconds <= 0) {
      cooldown.width = 0;
      cooldownStates.delete(key);
      return;
    }

    const totalMs = totalSeconds * 1000;
    const remainingMs = remainingSeconds * 1000;
    const fraction = Phaser.Math.Clamp(remainingMs / totalMs, 0, 1);
    cooldown.width = width * fraction;
    cooldownTween = scene.tweens.add({
      targets: cooldown,
      width: 0,
      duration: remainingMs,
      ease: 'Linear',
    });
  };

  if (parsed) {
    const now = Date.now();
    let state = cooldownStates.get(key);
    if (!state || state.readyAt <= now || parsed.seconds * 1000 > state.totalMs + 750) {
      state = { totalMs: parsed.seconds * 1000, readyAt: now + parsed.seconds * 1000 };
      cooldownStates.set(key, state);
    }
    const remainingMs = Math.max(0, state.readyAt - now);
    setCooldown(remainingMs / 1000, state.totalMs / 1000);
  } else {
    const prior = cooldownStates.get(key);
    if (prior && prior.readyAt > Date.now()) {
      const remainingMs = prior.readyAt - Date.now();
      setCooldown(remainingMs / 1000, prior.totalMs / 1000);
    } else if (prior) {
      cooldownStates.delete(key);
    }
  }

  hitArea.on('pointerover', () => {
    if (enabled) text.setStyle({ textDecoration: 'underline' });
  });
  hitArea.on('pointerout', release);
  hitArea.on('pointerupoutside', release);
  hitArea.on('pointerdown', release);
  hitArea.on('pointerup', () => {
    release();
    if (enabled) onClick();
  });

  return {
    root, bg, text, cooldown,
    setEnabled(next: boolean) {
      enabled = next;
      bg.setStrokeStyle(1, next ? COLORS.line : 0xb2b2b2, 1);
      text.setColor(next ? COLORS.text : '#b2b2b2');
      hitArea.input && (hitArea.input.cursor = next ? 'pointer' : 'default');
      if (!next) release();
    },
    setCooldown,
  };
}

export function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.floor(value).toString();
}
