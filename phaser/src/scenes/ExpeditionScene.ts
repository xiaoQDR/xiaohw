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
type Loot = Record<string, number>;
type Encounter = { key: string; tile: string; name: string; danger: number; hp: number; maxHp: number; enemyDamage: number };

const VIEW_RADIUS = 4;
const TILE = 92;

let persistentWorldMap: string[][] | null = null;
const persistentRevealed = new Set<string>();
const persistentCleared = new Set<string>();
const persistentClaimedMines = new Set<string>();

const TERRAIN_LABEL: Record<string, string> = {
  [WORLD_TILE.village]: '营地', [WORLD_TILE.forest]: '林', [WORLD_TILE.field]: '原', [WORLD_TILE.barrens]: '荒',
};
const TERRAIN_FILL: Record<string, number> = {
  [WORLD_TILE.village]: 0x9f7d52, [WORLD_TILE.forest]: 0x3f6344, [WORLD_TILE.field]: 0x72865d, [WORLD_TILE.barrens]: 0x6b6657,
};

export class ExpeditionScene extends Phaser.Scene {
  private worldMap: string[][] = [];
  private px = 0;
  private py = 0;
  private water = 0;
  private maxWater = 0;
  private hp = 10;
  private maxHp = 10;
  private attack = 1;
  private steps = 0;
  private capacity = 8;
  private supplies: Supplies = { curedMeat: 0, medicine: 0, bullets: 0 };
  private gear: Record<string, string | null> = {};
  private carriedLoot: Loot = {};
  private mapLayer?: Phaser.GameObjects.Container;
  private hudText?: Phaser.GameObjects.Text;
  private messageText?: Phaser.GameObjects.Text;
  private moving = false;
  private swipeStart?: { x: number; y: number };
  private encounter?: Encounter;
  private encounterPanel?: Phaser.GameObjects.Container;
  private encounterTitle?: Phaser.GameObjects.Text;
  private encounterText?: Phaser.GameObjects.Text;
  private attackText?: Phaser.GameObjects.Text;

  constructor() { super('ExpeditionScene'); }

  init(data: ExpeditionPayload): void {
    if (!persistentWorldMap) persistentWorldMap = generateWorldMap();
    this.worldMap = persistentWorldMap;
    this.px = 0; this.py = 0; this.steps = 0;
    this.gear = { ...(data.gear ?? {}) };
    this.supplies = {
      curedMeat: Math.max(0, Math.floor(data.supplies?.curedMeat ?? 0)),
      medicine: Math.max(0, Math.floor(data.supplies?.medicine ?? 0)),
      bullets: Math.max(0, Math.floor(data.supplies?.bullets ?? 0)),
    };
    this.maxWater = Math.max(0, Math.floor(data.water ?? 0));
    this.water = this.maxWater;
    this.maxHp = Math.max(1, Math.floor(data.hp ?? 10));
    this.hp = this.maxHp;
    this.attack = Math.max(1, Math.floor(data.attack ?? 1));
    this.capacity = Math.max(1, Math.floor(data.capacity ?? 8));
    this.carriedLoot = {};
    this.encounter = undefined;
    this.revealAroundPlayer();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#172019');
    const top = this.add.rectangle(0, 0, 1, 132, 0x172019, 0.98).setOrigin(0).setDepth(20);
    this.add.text(26, 20, '荒野 · 远征', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#f1e4c2', fontStyle: 'bold' }).setDepth(21);
    this.hudText = this.add.text(26, 66, '', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#bac8ae', lineSpacing: 4 }).setDepth(21);
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
    const controls = [
      makeBtn('↑', 0, -66, () => this.tryMove(0, -1)), makeBtn('←', -90, 0, () => this.tryMove(-1, 0)),
      makeBtn('↓', 0, 0, () => this.tryMove(0, 1)), makeBtn('→', 90, 0, () => this.tryMove(1, 0)),
    ];
    const returnBg = this.add.rectangle(0, 0, 210, 64, 0x5d4b37, 1).setStrokeStyle(2, 0x9b815f).setInteractive({ useHandCursor: true }).setDepth(22);
    const returnText = this.add.text(0, 0, '返回营地', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff1d2', fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
    returnBg.on('pointerdown', () => this.returnToCamp());

    this.createEncounterPanel();

    const layout = () => {
      const view = this.cameras.main.worldView;
      top.setSize(view.width, 132);
      bottom.setPosition(0, view.height - 270).setSize(view.width, 270);
      this.messageText?.setPosition(26, view.height - 244).setWordWrapWidth(Math.max(260, view.width - 52));
      const cx = Math.min(view.width * 0.5, 360), cy = view.height - 88;
      controls.forEach(({ bg, tx, dx, dy }) => { bg.setPosition(cx + dx, cy + dy); tx.setPosition(cx + dx, cy + dy); });
      returnBg.setPosition(view.width - 135, view.height - 87); returnText.setPosition(view.width - 135, view.height - 87);
      this.encounterPanel?.setPosition(view.width / 2, view.height / 2);
      this.renderMap();
    };

    this.scale.on('resize', layout);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.encounter) this.swipeStart = { x: p.x, y: p.y }; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart || this.encounter) return;
      const dx = p.x - this.swipeStart.x, dy = p.y - this.swipeStart.y; this.swipeStart = undefined;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 45) return;
      if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? 1 : -1, 0); else this.tryMove(0, dy > 0 ? 1 : -1);
    });

    layout(); this.refreshHud();
  }

  private createEncounterPanel(): void {
    const panel = this.add.container(0, 0).setDepth(40).setVisible(false);
    const shade = this.add.rectangle(0, 0, 760, 520, 0x151c17, 0.99).setStrokeStyle(3, 0x7b8d70).setInteractive();
    this.encounterTitle = this.add.text(-330, -220, '', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#f5dfb0', fontStyle: 'bold' });
    this.encounterText = this.add.text(-330, -160, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#d5deca', lineSpacing: 8, wordWrap: { width: 660 } });
    const attackBg = this.add.rectangle(-210, 170, 180, 60, 0x5a6948, 1).setStrokeStyle(2, 0x8b9b70).setInteractive({ useHandCursor: true });
    this.attackText = this.add.text(-210, 170, '攻击', { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff2d2', fontStyle: 'bold' }).setOrigin(0.5);
    const healBg = this.add.rectangle(0, 170, 180, 60, 0x465a48, 1).setStrokeStyle(2, 0x71856f).setInteractive({ useHandCursor: true });
    const healText = this.add.text(0, 170, '使用药剂', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#e7eddc', fontStyle: 'bold' }).setOrigin(0.5);
    const fleeBg = this.add.rectangle(210, 170, 180, 60, 0x58483c, 1).setStrokeStyle(2, 0x826d5b).setInteractive({ useHandCursor: true });
    const fleeText = this.add.text(210, 170, '撤离', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#eadccc', fontStyle: 'bold' }).setOrigin(0.5);
    attackBg.on('pointerdown', () => this.attackEnemy()); healBg.on('pointerdown', () => this.useMedicine()); fleeBg.on('pointerdown', () => this.fleeEncounter());
    panel.add([shade, this.encounterTitle, this.encounterText, attackBg, this.attackText, healBg, healText, fleeBg, fleeText]);
    this.encounterPanel = panel;
  }

  private revealAroundPlayer(): void {
    for (let y = -VIEW_RADIUS; y <= VIEW_RADIUS; y += 1) for (let x = -VIEW_RADIUS; x <= VIEW_RADIUS; x += 1) {
      if (Math.abs(x) + Math.abs(y) <= VIEW_RADIUS + 1) persistentRevealed.add(`${this.px + x},${this.py + y}`);
    }
  }

  private renderMap(): void {
    if (!this.mapLayer) return;
    this.mapLayer.removeAll(true);
    const view = this.cameras.main.worldView, usableTop = 150, usableBottom = view.height - 290;
    const centerX = view.width / 2, centerY = (usableTop + usableBottom) / 2;
    const radius = Math.min(VIEW_RADIUS, Math.max(2, Math.floor(Math.min(view.width / TILE, (usableBottom - usableTop) / TILE) / 2)));
    for (let gy = -radius; gy <= radius; gy += 1) for (let gx = -radius; gx <= radius; gx += 1) {
      const wx = this.px + gx, wy = this.py + gy, sx = centerX + gx * TILE, sy = centerY + gy * TILE;
      const key = `${wx},${wy}`, known = persistentRevealed.has(key), tile = getWorldTile(this.worldMap, wx, wy);
      const landmark = known ? getLandmark(tile) : undefined;
      const fill = known ? (TERRAIN_FILL[tile ?? ''] ?? (persistentCleared.has(key) ? 0x4f5d48 : 0x514b40)) : 0x202621;
      this.mapLayer.add(this.add.rectangle(sx, sy, TILE - 6, TILE - 6, fill, 1).setStrokeStyle(1, known ? 0x697562 : 0x2d332e));
      if (!known) { this.mapLayer.add(this.add.text(sx, sy, '?', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#4b544c' }).setOrigin(0.5)); continue; }
      let label = landmark?.name ?? TERRAIN_LABEL[tile ?? ''] ?? '·';
      if (landmark && persistentClaimedMines.has(key)) label = `${landmark.name}\n已占领`;
      else if (landmark && persistentCleared.has(key)) label = `${landmark.name}\n✓`;
      this.mapLayer.add(this.add.text(sx, sy, label, {
        fontFamily: 'system-ui, sans-serif', fontSize: landmark ? '14px' : '18px', color: landmark ? '#f2d497' : '#c6d0b8',
        fontStyle: landmark ? 'bold' : 'normal', align: 'center', wordWrap: { width: TILE - 12 },
      }).setOrigin(0.5));
    }
    this.mapLayer.add([
      this.add.circle(centerX, centerY, 19, 0xe7d6a2, 1).setStrokeStyle(5, 0x3b3024),
      this.add.text(centerX, centerY - 1, '@', { fontFamily: 'monospace', fontSize: '25px', color: '#2f2a22', fontStyle: 'bold' }).setOrigin(0.5),
    ]);
  }

  private tryMove(dx: number, dy: number): void {
    if (this.moving || this.encounter) return;
    if (this.water <= 0) { this.setMessage('水已经耗尽，不能继续深入。返回营地。'); return; }
    if (this.supplies.curedMeat <= 0) { this.setMessage('熏肉已经耗尽，不能继续深入。返回营地。'); return; }
    const nx = this.px + dx, ny = this.py + dy;
    if (Math.abs(nx) > WORLD_RADIUS || Math.abs(ny) > WORLD_RADIUS) { this.setMessage('这里已经是荒野边界。'); return; }
    this.moving = true; this.px = nx; this.py = ny; this.steps += 1; this.water = Math.max(0, this.water - 1);
    if (this.steps % 2 === 0) this.supplies.curedMeat = Math.max(0, this.supplies.curedMeat - 1);
    this.revealAroundPlayer(); this.renderMap(); this.refreshHud(); this.inspectCurrentTile();
    this.time.delayedCall(120, () => { this.moving = false; });
  }

  private inspectCurrentTile(): void {
    const tile = getWorldTile(this.worldMap, this.px, this.py), landmark = getLandmark(tile), key = `${this.px},${this.py}`;
    if (tile === WORLD_TILE.village) { this.setMessage('你回到了营地入口。可以点击“返回营地”结束远征。'); return; }
    if (landmark) {
      if (persistentCleared.has(key)) { this.setMessage(persistentClaimedMines.has(key) ? `${landmark.name}已经被营地占领。` : `${landmark.name}已经搜索过了。`); return; }
      this.startEncounter(key, tile ?? '', landmark.name, landmark.danger); return;
    }
    this.setMessage(`继续探索荒野。距离营地 ${Math.abs(this.px) + Math.abs(this.py)} 格。`);
  }

  private startEncounter(key: string, tile: string, name: string, danger: number): void {
    const maxHp = Math.max(6, 6 + danger * 2);
    this.encounter = { key, tile, name, danger, hp: maxHp, maxHp, enemyDamage: Math.max(1, Math.ceil(danger / 7)) };
    this.encounterPanel?.setVisible(true); this.refreshEncounter();
  }

  private refreshEncounter(): void {
    if (!this.encounter) return;
    const e = this.encounter;
    this.encounterTitle?.setText(`${e.name} · 遭遇`);
    this.encounterText?.setText(`敌人生命 ${e.hp}/${e.maxHp}    威胁 ${e.danger}\n你的生命 ${this.hp}/${this.maxHp}    药剂 ${this.supplies.medicine}    子弹 ${this.supplies.bullets}\n\n击败敌人后可以搜索地点并带回战利品。`);
    this.attackText?.setText(this.gear.weapon === 'rifle' ? '开火' : '攻击');
  }

  private attackEnemy(): void {
    if (!this.encounter) return;
    if (this.gear.weapon === 'rifle') {
      if (this.supplies.bullets <= 0) { this.setMessage('没有子弹，无法开火。'); return; }
      this.supplies.bullets -= 1;
    }
    this.encounter.hp = Math.max(0, this.encounter.hp - this.attack);
    if (this.encounter.hp <= 0) { this.winEncounter(); return; }
    this.hp = Math.max(0, this.hp - this.encounter.enemyDamage);
    if (this.hp <= 0) { this.dieInWilderness(); return; }
    this.refreshEncounter(); this.refreshHud();
  }

  private useMedicine(): void {
    if (!this.encounter || this.supplies.medicine <= 0 || this.hp >= this.maxHp) return;
    this.supplies.medicine -= 1; this.hp = Math.min(this.maxHp, this.hp + 5); this.refreshEncounter(); this.refreshHud();
  }

  private fleeEncounter(): void {
    if (!this.encounter) return;
    this.setMessage(`你从${this.encounter.name}撤离，没有获得战利品。`);
    this.encounter = undefined; this.encounterPanel?.setVisible(false);
  }

  private winEncounter(): void {
    if (!this.encounter) return;
    const e = this.encounter, loot = this.generateLoot(e.tile, e.danger);
    persistentCleared.add(e.key);
    const mineTiles: string[] = [WORLD_TILE.ironMine, WORLD_TILE.coalMine, WORLD_TILE.sulphurMine];
    if (mineTiles.includes(e.tile)) persistentClaimedMines.add(e.key);
    for (const [key, amount] of Object.entries(loot)) this.carriedLoot[key] = (this.carriedLoot[key] ?? 0) + amount;
    const lootText = Object.entries(loot).map(([key, amount]) => `${this.lootName(key)} +${amount}`).join(' · ');
    this.setMessage(`已清理 ${e.name}。${lootText || '没有找到有价值的东西。'}${persistentClaimedMines.has(e.key) ? '\n矿场已占领。' : ''}`);
    this.encounter = undefined; this.encounterPanel?.setVisible(false); this.renderMap(); this.refreshHud();
  }

  private generateLoot(tile: string, danger: number): Loot {
    const rand = (min: number, max: number) => Phaser.Math.Between(min, max);
    if (tile === WORLD_TILE.ironMine) return { iron: rand(20, 35), teeth: rand(1, 4) };
    if (tile === WORLD_TILE.coalMine) return { coal: rand(20, 35), fur: rand(2, 6) };
    if (tile === WORLD_TILE.sulphurMine) return { sulphur: rand(18, 30), scales: rand(2, 6) };
    if (tile === WORLD_TILE.house) return { curedMeat: rand(2, 6), fur: rand(2, 5), cloth: rand(1, 3) };
    if (tile === WORLD_TILE.cave) return { teeth: rand(3, 8), scales: rand(2, 6), meat: rand(3, 8) };
    if (tile === WORLD_TILE.town) return { iron: rand(5, 15), medicine: rand(1, 3), cloth: rand(3, 8) };
    if (tile === WORLD_TILE.city) return { steel: rand(4, 10), medicine: rand(1, 4), bullets: rand(3, 10) };
    if (tile === WORLD_TILE.battlefield) return { bullets: rand(8, 18), steel: rand(3, 8), teeth: rand(2, 7) };
    return { fur: rand(1, Math.max(2, Math.ceil(danger / 3))), meat: rand(1, Math.max(2, Math.ceil(danger / 4))) };
  }

  private lootName(key: string): string {
    const names: Record<string, string> = { wood: '木材', fur: '毛皮', meat: '肉', leather: '皮革', curedMeat: '熏肉', iron: '铁', coal: '煤', sulphur: '硫磺', steel: '钢', medicine: '药剂', scales: '鳞片', teeth: '牙齿', cloth: '布料', bullets: '子弹' };
    return names[key] ?? key;
  }

  private dieInWilderness(): void {
    this.encounter = undefined; this.encounterPanel?.setVisible(false); this.carriedLoot = {};
    this.supplies = { curedMeat: 0, medicine: 0, bullets: 0 };
    this.returnToCamp(true);
  }

  private refreshHud(): void {
    const lootCount = Object.values(this.carriedLoot).reduce((sum, value) => sum + value, 0);
    this.hudText?.setText(`位置 ${this.px},${this.py} · 距营地 ${Math.abs(this.px) + Math.abs(this.py)}    熏肉 ${this.supplies.curedMeat}    水 ${this.water}/${this.maxWater}\n生命 ${this.hp}/${this.maxHp}    攻击 ${this.attack}    药剂 ${this.supplies.medicine}    子弹 ${this.supplies.bullets}    战利品 ${lootCount}`);
  }

  private setMessage(text: string): void { this.messageText?.setText(text); }

  private returnToCamp(died = false): void {
    if (this.encounter && !died) { this.setMessage('战斗中不能直接返回营地，请先撤离。'); return; }
    const build = this.scene.get('BuildScene') as Phaser.Scene & Record<string, any>;
    if (!died) {
      for (const [key, amount] of Object.entries(this.carriedLoot)) {
        build[key] = Math.max(0, Number(build[key] ?? 0)) + Math.max(0, amount);
      }
    }
    build['claimedExpeditionMines'] = [...persistentClaimedMines];
    const refreshResources = build['refreshResources'] as (() => void) | undefined;
    refreshResources?.call(build);
    const finish = build['finishExpeditionFromWorld'] as ((remaining: Supplies) => void) | undefined;
    finish?.({ ...this.supplies });
    const showToast = build['showToast'] as ((message: string) => void) | undefined;
    if (died) showToast?.call(build, '你在荒野中倒下了，携带的补给和战利品全部遗失');
    else if (Object.keys(this.carriedLoot).length > 0) showToast?.call(build, '远征战利品已经送回营地');
    this.scene.stop(); this.scene.wake('BuildScene');
  }
}
