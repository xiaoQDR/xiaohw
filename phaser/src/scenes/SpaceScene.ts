import Phaser from 'phaser';

type SpacePayload = {
  hull?: number;
  engine?: number;
};

type Debris = {
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  spin: number;
};

const ASCENT_MS = 42000;
const STAGES = [
  { name: '对流层', at: 0 },
  { name: '平流层', at: 0.2 },
  { name: '中间层', at: 0.4 },
  { name: '热层', at: 0.6 },
  { name: '散逸层', at: 0.8 },
  { name: 'SPACE', at: 1 },
];

export class SpaceScene extends Phaser.Scene {
  private hullLevel = 3;
  private engineLevel = 3;
  private hp = 5;
  private maxHp = 5;
  private elapsed = 0;
  private ended = false;
  private ship?: Phaser.GameObjects.Container;
  private flame?: Phaser.GameObjects.Triangle;
  private debris: Debris[] = [];
  private stars: Phaser.GameObjects.Arc[] = [];
  private hud?: Phaser.GameObjects.Text;
  private stageText?: Phaser.GameObjects.Text;
  private progressBar?: Phaser.GameObjects.Rectangle;
  private resultLayer?: Phaser.GameObjects.Container;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private dragPointerId: number | null = null;
  private targetX: number | null = null;
  private spawnEvent?: Phaser.Time.TimerEvent;
  private invulnerableUntil = 0;

  constructor() {
    super('SpaceScene');
  }

  init(data: SpacePayload): void {
    this.hullLevel = Phaser.Math.Clamp(Math.floor(data.hull ?? 3), 1, 3);
    this.engineLevel = Phaser.Math.Clamp(Math.floor(data.engine ?? 3), 1, 3);
    this.maxHp = 2 + this.hullLevel;
    this.hp = this.maxHp;
    this.elapsed = 0;
    this.ended = false;
    this.debris = [];
    this.stars = [];
    this.targetX = null;
    this.dragPointerId = null;
    this.invulnerableUntil = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#050912');
    this.createStars();
    this.createShip();

    this.hud = this.add.text(18, 18, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#dfe9f3', lineSpacing: 5,
    }).setDepth(20).setScrollFactor(0);
    this.stageText = this.add.text(this.scale.width / 2, 26, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#f3e5bc', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(20).setScrollFactor(0);

    this.add.rectangle(16, 88, Math.max(120, this.scale.width - 32), 12, 0x28313d, 1)
      .setOrigin(0, 0.5).setDepth(19).setScrollFactor(0).setName('progressTrack');
    this.progressBar = this.add.rectangle(16, 88, 1, 8, 0x8fb7a4, 1)
      .setOrigin(0, 0.5).setDepth(20).setScrollFactor(0);

    const tip = this.add.text(this.scale.width / 2, this.scale.height - 26, '左右拖动控制星舰 · 躲避碎片', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#8c9cac',
    }).setOrigin(0.5, 1).setDepth(20).setScrollFactor(0);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.ended) return;
      this.dragPointerId = pointer.id;
      this.targetX = pointer.x;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.ended || this.dragPointerId !== pointer.id) return;
      this.targetX = pointer.x;
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragPointerId === pointer.id) this.dragPointerId = null;
    });

    this.spawnEvent = this.time.addEvent({
      delay: 720,
      loop: true,
      callback: () => this.spawnDebris(),
    });

    const layout = () => {
      const width = this.scale.width;
      const height = this.scale.height;
      const track = this.children.getByName('progressTrack') as Phaser.GameObjects.Rectangle | null;
      track?.setSize(Math.max(120, width - 32), 12);
      this.stageText?.setPosition(width / 2, 26);
      tip.setPosition(width / 2, height - 26);
      if (this.ship) {
        this.ship.y = Math.max(220, height - 150);
        this.ship.x = Phaser.Math.Clamp(this.ship.x, 38, width - 38);
      }
      this.layoutResult();
    };
    this.scale.on('resize', layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', layout);
      this.input.removeAllListeners();
    });

    layout();
    this.refreshHud();
  }

  update(_time: number, delta: number): void {
    this.updateStars(delta);
    if (this.ended || !this.ship) return;

    this.elapsed += delta;
    const progress = Phaser.Math.Clamp(this.elapsed / ASCENT_MS, 0, 1);
    this.updateShip(delta);
    this.updateDebris(delta);
    this.refreshHud();

    if (this.progressBar) this.progressBar.width = Math.max(1, (this.scale.width - 32) * progress);
    if (progress >= 1) this.finish(true);
  }

  private createStars(): void {
    const count = Math.max(28, Math.floor((this.scale.width * this.scale.height) / 18000));
    for (let i = 0; i < count; i += 1) {
      const star = this.add.circle(
        Phaser.Math.Between(0, Math.max(1, this.scale.width)),
        Phaser.Math.Between(0, Math.max(1, this.scale.height)),
        Phaser.Math.Between(1, 2),
        i % 4 === 0 ? 0xc5d5e8 : 0x7f91a6,
        Phaser.Math.FloatBetween(0.35, 0.9),
      ).setDepth(0);
      this.stars.push(star);
    }
  }

  private createShip(): void {
    const x = this.scale.width / 2;
    const y = Math.max(220, this.scale.height - 150);
    const hull = this.add.triangle(0, 0, 0, 42, 26, -36, 52, 42, 0xc5ccd1, 1)
      .setStrokeStyle(3, 0x55616c, 1);
    const core = this.add.circle(0, 4, 9, 0x8fb7a4, 1).setStrokeStyle(2, 0xd8ece3, 1);
    const wingL = this.add.triangle(-29, 22, 0, 20, 24, -12, 26, 32, 0x7c8992, 1);
    const wingR = this.add.triangle(29, 22, 0, 20, -24, -12, -26, 32, 0x7c8992, 1);
    this.flame = this.add.triangle(0, 58, -10, -10, 10, -10, 0, 24, 0xe7b868, 0.95);
    this.ship = this.add.container(x, y, [this.flame, wingL, wingR, hull, core]).setDepth(10);
  }

  private updateShip(delta: number): void {
    if (!this.ship) return;
    const speed = 250 + this.engineLevel * 85;
    let direction = 0;
    if (this.cursors?.left?.isDown) direction -= 1;
    if (this.cursors?.right?.isDown) direction += 1;

    if (direction !== 0) this.ship.x += direction * speed * (delta / 1000);
    else if (this.targetX != null) {
      const diff = this.targetX - this.ship.x;
      const step = speed * (delta / 1000);
      this.ship.x += Phaser.Math.Clamp(diff, -step, step);
    }
    this.ship.x = Phaser.Math.Clamp(this.ship.x, 34, this.scale.width - 34);
    if (this.flame) this.flame.scaleY = 0.75 + Math.random() * 0.5;
  }

  private updateStars(delta: number): void {
    const speed = 70 + this.engineLevel * 12;
    for (const star of this.stars) {
      star.y += speed * delta / 1000;
      if (star.y > this.scale.height + 4) {
        star.y = -4;
        star.x = Phaser.Math.Between(0, Math.max(1, this.scale.width));
      }
    }
  }

  private spawnDebris(): void {
    if (this.ended) return;
    const progress = Phaser.Math.Clamp(this.elapsed / ASCENT_MS, 0, 1);
    const radius = Phaser.Math.Between(13, 28);
    const x = Phaser.Math.Between(radius + 4, Math.max(radius + 5, this.scale.width - radius - 4));
    const y = -radius - 20;
    const isRock = Math.random() < 0.72;
    const body = isRock
      ? this.add.circle(x, y, radius, 0x6f675f, 1).setStrokeStyle(2, 0x9a8e80, 1)
      : this.add.rectangle(x, y, radius * 1.8, radius * 1.1, 0x59636d, 1).setStrokeStyle(2, 0x88939e, 1);
    body.setDepth(8).setAngle(Phaser.Math.Between(0, 359));
    this.debris.push({
      body,
      vx: Phaser.Math.Between(-35, 35),
      vy: 210 + progress * 230 + Phaser.Math.Between(-20, 60),
      spin: Phaser.Math.Between(-100, 100),
    });

    const nextDelay = Phaser.Math.Clamp(760 - progress * 280 - this.engineLevel * 15, 330, 760);
    this.spawnEvent?.reset({ delay: nextDelay, loop: true, callback: () => this.spawnDebris(), callbackScope: this });
  }

  private updateDebris(delta: number): void {
    if (!this.ship) return;
    const dt = delta / 1000;
    const shipX = this.ship.x;
    const shipY = this.ship.y;
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const item = this.debris[i];
      item.body.x += item.vx * dt;
      item.body.y += item.vy * dt;
      item.body.angle += item.spin * dt;

      const bounds = item.body.getBounds();
      const dx = Math.max(bounds.left - shipX, 0, shipX - bounds.right);
      const dy = Math.max(bounds.top - shipY, 0, shipY - bounds.bottom);
      if (dx * dx + dy * dy < 28 * 28 && this.time.now >= this.invulnerableUntil) {
        this.hitShip();
        item.body.destroy();
        this.debris.splice(i, 1);
        continue;
      }
      if (item.body.y > this.scale.height + 80 || item.body.x < -100 || item.body.x > this.scale.width + 100) {
        item.body.destroy();
        this.debris.splice(i, 1);
      }
    }
  }

  private hitShip(): void {
    if (!this.ship || this.ended) return;
    this.hp = Math.max(0, this.hp - 1);
    this.invulnerableUntil = this.time.now + 900;
    this.cameras.main.shake(180, 0.009);
    this.tweens.add({ targets: this.ship, alpha: 0.25, yoyo: true, repeat: 3, duration: 90 });
    this.refreshHud();
    if (this.hp <= 0) this.finish(false);
  }

  private currentStage(progress: number): string {
    let name = STAGES[0].name;
    for (const stage of STAGES) if (progress >= stage.at) name = stage.name;
    return name;
  }

  private refreshHud(): void {
    const progress = Phaser.Math.Clamp(this.elapsed / ASCENT_MS, 0, 1);
    this.hud?.setText(`船体 ${this.hp}/${this.maxHp}   引擎 Lv.${this.engineLevel}\n高度 ${Math.floor(progress * 100)}%`);
    this.stageText?.setText(this.currentStage(progress));
  }

  private finish(success: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.spawnEvent?.remove(false);
    for (const item of this.debris) item.body.destroy();
    this.debris = [];

    const build = this.scene.get('build') as Phaser.Scene & Record<string, any>;
    if (success) {
      build.starshipCompleted = true;
      build.starshipLaunchUnlocked = true;
    }
    this.showResult(success);
  }

  private showResult(success: boolean): void {
    const shade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x05070a, 0.82)
      .setOrigin(0).setDepth(50).setScrollFactor(0);
    const panel = this.add.rectangle(0, 0, 1, 1, 0x172029, 0.98).setStrokeStyle(2, 0x6c7a86, 1);
    const title = this.add.text(0, -90, success ? '进入 SPACE' : '星舰失控', {
      fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: success ? '#f3e4b7' : '#f1c3b1', fontStyle: 'bold',
    }).setOrigin(0.5);
    const desc = this.add.text(0, -20, success
      ? '星舰冲出大气层。你离开了这片荒野。\n本轮主线已经完成。'
      : '船体在上升途中损毁。\n你被迫返回营地，可以再次尝试起飞。', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#c8d1d8', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    const btn = this.add.rectangle(0, 105, 240, 62, 0x536b5a, 1).setStrokeStyle(2, 0x819285, 1).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(0, 105, '返回营地', {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const card = this.add.container(0, 0, [panel, title, desc, btn, btnText]).setDepth(51).setScrollFactor(0);
    this.resultLayer = this.add.container(0, 0, [shade, card]).setDepth(50).setScrollFactor(0);
    btn.on('pointerdown', () => this.returnToCamp(success));
    this.layoutResult();
  }

  private layoutResult(): void {
    if (!this.resultLayer) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const shade = this.resultLayer.list[0] as Phaser.GameObjects.Rectangle;
    const card = this.resultLayer.list[1] as Phaser.GameObjects.Container;
    shade.setSize(width, height);
    card.setPosition(width / 2, height / 2);
    const panel = card.list[0] as Phaser.GameObjects.Rectangle;
    panel.setSize(Math.min(620, width - 28), 360);
  }

  private returnToCamp(success: boolean): void {
    const build = this.scene.get('build') as Phaser.Scene & Record<string, any>;
    const toast = build.showToast as ((text: string) => void) | undefined;
    if (success) toast?.call(build, '星舰已进入太空，主线通关');
    else toast?.call(build, '星舰起飞失败，可以继续尝试');
    this.scene.wake('build');
    this.scene.stop('SpaceScene');
  }
}
