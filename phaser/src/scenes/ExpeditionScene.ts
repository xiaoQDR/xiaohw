import Phaser from 'phaser';
import { generateWorldMap, getLandmark, getWorldTile, WORLD_RADIUS, WORLD_TILE } from '../game/worldMap';

type ExpeditionPayload = {
  player?: boolean;
  memberCount?: number;
  gear?: Record<string, string | null>;
  supplies?: { curedMeat?: number; medicine?: number; bullets?: number };
  capacity?: number;
  water?: number;
  hp?: number;
  attack?: number;
  distance?: number;
};

type Supplies = { curedMeat: number; medicine: number; bullets: number };

const VIEW_RADIUS = 4;
const TILE = 92;

const TERRAIN_LABEL: Record<string, string> = {
  [WORLD_TILE.village]: '营地',
  [WORLD_TILE.forest]: '林',
  [WORLD_TILE.field]: '原',
  [WORLD_TILE.barrens]: '荒',
};

const TERRAIN_FILL: Record<string, number> = {
  [WORLD_TILE.village]: 0x9f7d52,
  [WORLD_TILE.forest]: 0x3f6344,
  [WORLD_TILE.field]: 0x72865d,
  [WORLD_TILE.barrens]: 0x6b6657,
};

export class ExpeditionScene extends Phaser.Scene {
  private worldMap: string[][] = [];
  private px = 0;
  private py = 0;
  private water = 0;
  private maxWater = 0;
  private hp = 10;
  private attack = 1;
  private steps = 0;
  private supplies: Supplies = { curedMeat: 0, medicine: 0, bullets: 0 };
  private gear: Record<string, string | null> = {};
  private revealed = new Set<string>();
  private mapLayer?: Phaser.GameObjects.Container;
  private hudText?: Phaser.GameObjects.Text;
  private messageText?: Phaser.GameObjects.Text;
  private moving = false;
  private swipeStart?: { x: number; y: number };

  constructor() {
    super('ExpeditionScene');
  }

  init(data: ExpeditionPayload): void {
    this.worldMap = generateWorldMap();
    this.px = 0;
    this.py = 0;
    this.steps = 0;
    this.gear = { ...(data.gear ?? {}) };
    this.supplies = {
      curedMeat: Math.max(0, Math.floor(data.supplies?.curedMeat ?? 0)),
      medicine: Math.max(0, Math.floor(data.supplies?.medicine ?? 0)),
      bullets: Math.max(0, Math.floor(data.supplies?.bullets ?? 0)),
    };
    this.maxWater = Math.max(0, Math.floor(data.water ?? 0));
    this.water = this.maxWater;
    this.hp = Math.max(1, Math.floor(data.hp ?? 10));
    this.attack = Math.max(1, Math.floor(data.attack ?? 1));
    this.revealed.clear();
    this.revealAroundPlayer();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#172019');

    const top = this.add.rectangle(0, 0, 1, 132, 0x172019, 0.98).setOrigin(0).setDepth(20);
    const title = this.add.text(26, 20, '荒野 · 远征', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#f1e4c2', fontStyle: 'bold',
    }).setDepth(21);
    this.hudText = this.add.text(26, 66, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#bac8ae', lineSpacing: 4,
    }).setDepth(21);

    this.mapLayer = this.add.container(0, 0).setDepth(5);

    const bottom = this.add.rectangle(0, 0, 1, 270, 0x172019, 0.985).setOrigin(0).setDepth(20);
    this.messageText = this.add.text(26, 0, '从营地出发。探索迷雾中的地标。', {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#d6d7bd', wordWrap: { width: 760 },
    }).setDepth(21);

    const makeBtn = (label: string, dx: number, dy: number, action: () => void) => {
      const bg = this.add.rectangle(0, 0, 84, 64, 0x354638, 1).setStrokeStyle(2, 0x71816b).setInteractive({ useHandCursor: true }).setDepth(22);
      const tx = this.add.text(0, 0, label, { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#f4ead0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
      bg.on('pointerdown', () => action());
      return { bg, tx, dx, dy };
    };
    const up = makeBtn('↑', 0, -66, () => this.tryMove(0, -1));
    const left = makeBtn('←', -90, 0, () => this.tryMove(-1, 0));
    const down = makeBtn('↓', 0, 0, () => this.tryMove(0, 1));
    const right = makeBtn('→', 90, 0, () => this.tryMove(1, 0));
    const controls = [up, left, down, right];

    const returnBg = this.add.rectangle(0, 0, 210, 64, 0x5d4b37, 1).setStrokeStyle(2, 0x9b815f).setInteractive({ useHandCursor: true }).setDepth(22);
    const returnText = this.add.text(0, 0, '返回营地', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff1d2', fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
    returnBg.on('pointerdown', () => this.returnToCamp());

    const layout = () => {
      const view = this.cameras.main.worldView;
      top.setSize(view.width, 132);
      bottom.setPosition(0, view.height - 270).setSize(view.width, 270);
      this.messageText?.setPosition(26, view.height - 244).setWordWrapWidth(Math.max(260, view.width - 52));
      const cx = Math.min(view.width * 0.5, 360);
      const cy = view.height - 88;
      controls.forEach(({ bg, tx, dx, dy }) => { bg.setPosition(cx + dx, cy + dy); tx.setPosition(cx + dx, cy + dy); });
      returnBg.setPosition(view.width - 135, view.height - 87);
      returnText.setPosition(view.width - 135, view.height - 87);
      this.renderMap();
    };

    this.scale.on('resize', layout);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.swipeStart = { x: p.x, y: p.y }; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return;
      const dx = p.x - this.swipeStart.x;
      const dy = p.y - this.swipeStart.y;
      this.swipeStart = undefined;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 45) return;
      if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? 1 : -1, 0);
      else this.tryMove(0, dy > 0 ? 1 : -1);
    });

    layout();
    this.refreshHud();
  }

  private revealAroundPlayer(): void {
    for (let y = -VIEW_RADIUS; y <= VIEW_RADIUS; y += 1) {
      for (let x = -VIEW_RADIUS; x <= VIEW_RADIUS; x += 1) {
        if (Math.abs(x) + Math.abs(y) <= VIEW_RADIUS + 1) this.revealed.add(`${this.px + x},${this.py + y}`);
      }
    }
  }

  private renderMap(): void {
    if (!this.mapLayer) return;
    this.mapLayer.removeAll(true);
    const view = this.cameras.main.worldView;
    const usableTop = 150;
    const usableBottom = view.height - 290;
    const centerX = view.width / 2;
    const centerY = (usableTop + usableBottom) / 2;
    const radius = Math.min(VIEW_RADIUS, Math.max(2, Math.floor(Math.min(view.width / TILE, (usableBottom - usableTop) / TILE) / 2)));

    for (let gy = -radius; gy <= radius; gy += 1) {
      for (let gx = -radius; gx <= radius; gx += 1) {
        const wx = this.px + gx;
        const wy = this.py + gy;
        const sx = centerX + gx * TILE;
        const sy = centerY + gy * TILE;
        const known = this.revealed.has(`${wx},${wy}`);
        const tile = getWorldTile(this.worldMap, wx, wy);
        const landmark = known ? getLandmark(tile) : undefined;
        const fill = known ? (TERRAIN_FILL[tile ?? ''] ?? 0x514b40) : 0x202621;
        const cell = this.add.rectangle(sx, sy, TILE - 6, TILE - 6, fill, 1).setStrokeStyle(1, known ? 0x697562 : 0x2d332e, 1);
        this.mapLayer.add(cell);

        if (!known) {
          const fog = this.add.text(sx, sy, '?', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#4b544c' }).setOrigin(0.5);
          this.mapLayer.add(fog);
          continue;
        }

        const label = landmark?.name ?? TERRAIN_LABEL[tile ?? ''] ?? '·';
        const text = this.add.text(sx, sy, label, {
          fontFamily: 'system-ui, sans-serif', fontSize: landmark ? '15px' : '18px', color: landmark ? '#f2d497' : '#c6d0b8',
          fontStyle: landmark ? 'bold' : 'normal', align: 'center', wordWrap: { width: TILE - 12 },
        }).setOrigin(0.5);
        this.mapLayer.add(text);
      }
    }

    const player = this.add.circle(centerX, centerY, 19, 0xe7d6a2, 1).setStrokeStyle(5, 0x3b3024, 1);
    const marker = this.add.text(centerX, centerY - 1, '@', { fontFamily: 'monospace', fontSize: '25px', color: '#2f2a22', fontStyle: 'bold' }).setOrigin(0.5);
    this.mapLayer.add([player, marker]);
  }

  private tryMove(dx: number, dy: number): void {
    if (this.moving) return;
    if (this.water <= 0) { this.setMessage('水已经耗尽，不能继续深入。返回营地。'); return; }
    if (this.supplies.curedMeat <= 0) { this.setMessage('熏肉已经耗尽，不能继续深入。返回营地。'); return; }
    const nx = this.px + dx;
    const ny = this.py + dy;
    if (Math.abs(nx) > WORLD_RADIUS || Math.abs(ny) > WORLD_RADIUS) { this.setMessage('这里已经是荒野边界。'); return; }

    this.moving = true;
    this.px = nx;
    this.py = ny;
    this.steps += 1;
    this.water = Math.max(0, this.water - 1);
    if (this.steps % 2 === 0) this.supplies.curedMeat = Math.max(0, this.supplies.curedMeat - 1);
    this.revealAroundPlayer();
    this.renderMap();
    this.refreshHud();
    this.inspectCurrentTile();
    this.time.delayedCall(120, () => { this.moving = false; });
  }

  private inspectCurrentTile(): void {
    const tile = getWorldTile(this.worldMap, this.px, this.py);
    const landmark = getLandmark(tile);
    if (tile === WORLD_TILE.village) {
      this.setMessage('你回到了营地入口。可以点击“返回营地”结束远征。');
      return;
    }
    if (landmark) {
      this.setMessage(`发现：${landmark.name} · 危险 ${landmark.danger}。\n第一版已接入地标发现；下一阶段会在这里进入战斗 / 搜索 / 占领。`);
      return;
    }
    const distance = Math.abs(this.px) + Math.abs(this.py);
    this.setMessage(`继续探索荒野。距离营地 ${distance} 格。`);
  }

  private refreshHud(): void {
    const dist = Math.abs(this.px) + Math.abs(this.py);
    this.hudText?.setText(
      `位置 ${this.px},${this.py} · 距营地 ${dist}    熏肉 ${this.supplies.curedMeat}    水 ${this.water}/${this.maxWater}\n生命 ${this.hp}    攻击 ${this.attack}    药剂 ${this.supplies.medicine}    子弹 ${this.supplies.bullets}`,
    );
  }

  private setMessage(text: string): void {
    this.messageText?.setText(text);
  }

  private returnToCamp(): void {
    const build = this.scene.get('BuildScene') as Phaser.Scene & Record<string, unknown>;
    const finish = build['finishExpeditionFromWorld'] as ((remaining: Supplies) => void) | undefined;
    finish?.({ ...this.supplies });
    this.scene.stop();
    this.scene.wake('BuildScene');
  }
}
