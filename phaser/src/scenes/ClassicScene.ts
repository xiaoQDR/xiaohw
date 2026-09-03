import Phaser from 'phaser';

/**
 * Phaser owns the page lifecycle while the canonical game runtime is kept in
 * an isolated same-origin frame. This lets us ship every original system now
 * and replace individual renderers with Phaser without changing save data or
 * event outcomes during the migration.
 */
export class ClassicScene extends Phaser.Scene {
  private frame: HTMLIFrameElement | null = null;
  private readonly receiveRuntimeMessage = (event: MessageEvent): void => {
    if (event.source !== this.frame?.contentWindow || event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== 'xiaohw-classic') return;

    if (event.data.type === 'title' && typeof event.data.value === 'string') {
      document.title = event.data.value;
    }
    if (event.data.type === 'language' && typeof event.data.value === 'string') {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', event.data.value);
      window.history.replaceState(null, '', url);
    }
  };

  constructor() {
    super('classic-game');
  }

  create(): void {
    const host = this.game.canvas.parentElement;
    if (!host) return;

    const frame = document.createElement('iframe');
    frame.className = 'classic-game-frame';
    frame.title = '小黑屋完整游戏';
    const params = new URLSearchParams(window.location.search);
    const savedLanguage = localStorage.getItem('lang');
    if (!params.has('lang')) params.set('lang', savedLanguage || 'zh_cn');
    params.set('ignorebrowser', 'true');
    frame.src = `./classic/index.html?${params.toString()}`;
    frame.allow = 'autoplay';
    frame.setAttribute('aria-label', '小黑屋完整游戏');
    frame.addEventListener('load', () => frame.contentWindow?.focus());
    host.appendChild(frame);
    this.frame = frame;
    window.addEventListener('message', this.receiveRuntimeMessage);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('message', this.receiveRuntimeMessage);
      this.frame?.remove();
      this.frame = null;
    });
  }
}
