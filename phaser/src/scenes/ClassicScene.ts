import Phaser from 'phaser';

/**
 * Phaser owns the page lifecycle while the canonical game runtime is kept in
 * an isolated same-origin frame. This lets us ship every original system now
 * and replace individual renderers with Phaser without changing save data or
 * event outcomes during the migration.
 */
export class ClassicScene extends Phaser.Scene {
  private frame: HTMLIFrameElement | null = null;

  constructor() {
    super('classic-game');
  }

  create(): void {
    const host = this.game.canvas.parentElement;
    if (!host) return;

    const frame = document.createElement('iframe');
    frame.className = 'classic-game-frame';
    frame.title = '小黑屋完整游戏';
    frame.src = './classic/index.html?ignorebrowser=true&lang=zh_cn';
    frame.allow = 'autoplay';
    frame.setAttribute('aria-label', '小黑屋完整游戏');
    host.appendChild(frame);
    this.frame = frame;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.frame?.remove();
      this.frame = null;
    });
  }
}
