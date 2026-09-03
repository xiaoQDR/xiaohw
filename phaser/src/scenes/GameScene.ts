import Phaser from 'phaser';
import { BUILDINGS, CRAFTS, FIRE_NAMES, JOB_NAMES, JOB_PRODUCTION, RESOURCE_NAMES, TRADES } from '../game/data';
import { clearState, freshState, loadState, saveState } from '../game/state';
import type { BuildDefinition, Cost, CraftDefinition, Job, Resource, SaveState, TradeDefinition, ViewName } from '../game/types';
import { getLandmark, getWorldTile, WORLD_RADIUS } from '../game/worldMap';
import { button, COLORS, formatAmount, label, panel, type ButtonParts } from '../ui/components';

const W = 1080;
const H = 1920;

interface WeaponDefinition {
  id: string;
  name: string;
  damage: number | 'stun';
  cooldown: number;
  ammo?: Resource;
  permanent?: string;
}

interface PendingLandmark {
  tile: string;
  key: string;
  name: string;
  danger: number;
  stage: 'intro' | 'reward';
  loot: Partial<Record<Resource, number>>;
}

const LANDMARK_TEXT: Record<string, { intro: string; approach: string; cleared: string }> = {
  I: { intro: '矿道里传来金属摩擦声。', approach: '进入铁矿', cleared: '矿脉重新暴露在昏暗天光下。' },
  C: { intro: '黑色尘埃从废弃矿井中飘出。', approach: '进入煤矿', cleared: '煤层仍然足够村庄开采很久。' },
  S: { intro: '空气中弥漫着刺鼻的硫磺味。', approach: '进入硫磺矿', cleared: '矿井被清理，硫磺可以运回村庄。' },
  H: { intro: '一间老屋歪斜地立在荒地上。', approach: '推门进入', cleared: '屋里只剩尘土和可以带走的物资。' },
  V: { intro: '洞穴深处有东西在潮湿岩壁间移动。', approach: '点燃火把进入', cleared: '回声停了，洞穴归于寂静。' },
  O: { intro: '倒塌的街道延伸进废弃城镇。', approach: '搜索城镇', cleared: '最后的抵抗者倒下，街道可以安全穿行。' },
  Y: { intro: '高楼的空洞窗户俯视着旅人。', approach: '进入城市', cleared: '城市废墟中仍残留着旧时代的技术。' },
  W: { intro: '一艘星舰裂开在尘土中，船体仍有微弱脉冲。', approach: '登上星舰', cleared: '驾驶舱还活着。它也许能再次飞行。' },
  B: { intro: '巨大的钻井直通看不见底的黑暗。', approach: '沿平台下降', cleared: '机械停止转动，只剩可回收的零件。' },
  F: { intro: '锈蚀武器散落在一片无名战场上。', approach: '穿过战场', cleared: '风吹过空荡的战壕。' },
  M: { intro: '浑浊沼泽冒着气泡，芦苇后有影子。', approach: '涉入沼泽', cleared: '沼泽重新安静下来。' },
  X: { intro: '受创战舰横卧荒野，陌生信号从内部重复发出。', approach: '进入战舰', cleared: '异星舰桥向旅人开放。' },
};

const AUDIO_FILES = [
  'fire-dead', 'fire-smoldering', 'fire-flickering', 'fire-burning', 'fire-roaring',
  'silent-forest', 'lonely-hut', 'tiny-village', 'modest-village', 'large-village', 'raucous-village',
  'world', 'dusty-path', 'ship', 'space', 'ending', 'light-fire', 'stoke-fire', 'gather-wood', 'check-traps',
  'build', 'craft', 'buy', 'embark', 'eat-meat', 'use-meds', 'death', 'reinforce-hull',
  'upgrade-engine', 'lift-off', 'crash', 'encounter-tier-1', 'encounter-tier-2', 'encounter-tier-3',
  'weapon-unarmed-1', 'weapon-unarmed-2', 'weapon-unarmed-3',
  'weapon-melee-1', 'weapon-melee-2', 'weapon-melee-3',
  'weapon-ranged-1', 'weapon-ranged-2', 'weapon-ranged-3',
  'footsteps-1', 'footsteps-2', 'footsteps-3', 'footsteps-4', 'footsteps-5', 'footsteps-6',
  'asteroid-hit-1', 'asteroid-hit-2', 'asteroid-hit-3', 'asteroid-hit-4',
  'asteroid-hit-5', 'asteroid-hit-6', 'asteroid-hit-7', 'asteroid-hit-8',
  'landmark-swamp', 'landmark-cave', 'landmark-town', 'landmark-city', 'landmark-house',
  'landmark-battlefield', 'landmark-borehole', 'landmark-crashed-ship', 'landmark-sulphurmine',
  'landmark-coalmine', 'landmark-ironmine',
] as const;

const LANDMARK_AUDIO: Record<string, string> = {
  I: 'landmark-ironmine', C: 'landmark-coalmine', S: 'landmark-sulphurmine', H: 'landmark-house',
  V: 'landmark-cave', O: 'landmark-town', Y: 'landmark-city', W: 'landmark-crashed-ship',
  B: 'landmark-borehole', F: 'landmark-battlefield', M: 'landmark-swamp', X: 'landmark-crashed-ship',
};

const WEAPONS: WeaponDefinition[] = [
  { id: 'fists', name: '拳击', damage: 1, cooldown: 2 },
  { id: 'boneSpear', name: '刺击', damage: 2, cooldown: 2, permanent: 'boneSpear' },
  { id: 'ironSword', name: '挥砍', damage: 4, cooldown: 2, permanent: 'ironSword' },
  { id: 'steelSword', name: '斩击', damage: 6, cooldown: 2, permanent: 'steelSword' },
  { id: 'bayonet', name: '突刺', damage: 8, cooldown: 2, permanent: 'bayonet' },
  { id: 'rifle', name: '射击', damage: 5, cooldown: 1, permanent: 'rifle', ammo: 'bullets' },
  { id: 'laserRifle', name: '激光', damage: 8, cooldown: 1, permanent: 'laserRifle', ammo: 'energyCell' },
  { id: 'grenade', name: '投弹', damage: 15, cooldown: 5, ammo: 'grenade' },
  { id: 'bolas', name: '缠绕', damage: 'stun', cooldown: 15, ammo: 'bolas' },
  { id: 'plasmaRifle', name: '解离', damage: 12, cooldown: 1, permanent: 'plasmaRifle', ammo: 'energyCell' },
  { id: 'energyBlade', name: '切割', damage: 10, cooldown: 2, permanent: 'energyBlade' },
  { id: 'disruptor', name: '眩晕', damage: 'stun', cooldown: 15, permanent: 'disruptor' },
];

export class GameScene extends Phaser.Scene {
  private state!: SaveState;
  private view: ViewName = 'room';
  private page = 0;
  private subPage = 0;
  private root!: Phaser.GameObjects.Container;
  private nav!: Phaser.GameObjects.Container;
  private resourceText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private saveText!: Phaser.GameObjects.Text;
  private activeEnemy: { name: string; hp: number; maxHp: number; damage: number; nextAttack: number; stunnedUntil: number; loot: Partial<Record<Resource, number>>; landmarkKey?: string } | null = null;
  private actionReadyAt: Record<string, number> = {};
  private pendingLandmark: PendingLandmark | null = null;
  private spaceShipObject: Phaser.GameObjects.Rectangle | null = null;
  private spaceHullText: Phaser.GameObjects.Text | null = null;
  private spaceAltitudeText: Phaser.GameObjects.Text | null = null;
  private spaceAsteroids = new Set<Phaser.GameObjects.Text>();
  private spaceDirection = { up: false, down: false, left: false, right: false };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentMusicKey = '';

  constructor() {
    super('game');
  }

  preload(): void {
    AUDIO_FILES.forEach(file => this.load.audio(file, `audio/${file}.flac`));
  }

  create(): void {
    this.state = loadState();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.resizeViewport(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    });
    this.drawShell();
    this.showView(this.state.gameWon ? 'ending' : this.state.ship.inFlight ? 'space' : this.state.world.active ? 'world' : 'room');

    this.time.addEvent({ delay: 1000, loop: true, callback: this.tick, callbackScope: this });
    this.time.addEvent({ delay: 10000, loop: true, callback: () => this.persist(false) });
    this.time.addEvent({ delay: 33, loop: true, callback: this.updateSpace, callbackScope: this });
    this.time.addEvent({ delay: 500, loop: true, callback: this.spawnAsteroidWave, callbackScope: this });
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.once('pointerdown', () => this.updateMusic(true));
    this.input.keyboard?.on('keydown-ONE', () => this.showView('room'));
    this.input.keyboard?.on('keydown-TWO', () => this.state.builderArrived && this.showView('village'));
    this.input.keyboard?.on('keydown-THREE', () => this.state.worldUnlocked && this.showView('world'));
    this.input.keyboard?.on('keydown-FOUR', () => this.state.shipUnlocked && !this.state.ship.inFlight && this.showView('ship'));
  }

  private resizeViewport(gameSize: Phaser.Structs.Size): void {
    const viewportWidth = Math.max(1, gameSize.width);
    const viewportHeight = Math.max(1, gameSize.height);
    const zoom = Math.min(viewportWidth / W, viewportHeight / H);
    const visibleHeight = viewportHeight / zoom;

    this.cameras.main
      .setViewport(0, 0, viewportWidth, viewportHeight)
      .setZoom(zoom)
      .centerOn(W / 2, visibleHeight / 2);
  }

  private drawShell(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    this.add.rectangle(W / 2, 74, W, 148, 0x101214);
    label(this, 48, 62, '小黑屋', 40).setFontStyle('bold');
    this.clockText = label(this, 48, 112, '', 20, COLORS.dim);
    this.resourceText = label(this, W - 48, 76, '', 22).setOrigin(1, 0.5).setAlign('right');
    this.saveText = label(this, W - 48, 120, '', 18, COLORS.dim).setOrigin(1, 0.5);

    this.nav = this.add.container(0, 150);
    this.root = this.add.container(0, 280);
    this.refreshHeader();
  }

  private refreshHeader(): void {
    const minutes = Math.floor((Date.now() - this.state.startedAt) / 60000);
    this.clockText.setText(`余火燃烧了 ${minutes} 分钟`);
    const visible = (Object.keys(this.state.stores) as Resource[])
      .filter((key) => this.state.stores[key] >= 1)
      .slice(0, this.scale.width < 700 ? 3 : 5)
      .map((key) => `${RESOURCE_NAMES[key]} ${formatAmount(this.state.stores[key])}`);
    this.resourceText.setText(visible.length ? visible.join('  ·  ') : '身无长物');
  }

  private drawNav(): void {
    this.nav.removeAll(true);
    if (this.view === 'space' || this.view === 'ending') return;
    const items: Array<{ id: ViewName; name: string; unlocked: boolean }> = [
      { id: 'room', name: '房间', unlocked: true },
      { id: 'village', name: '村庄', unlocked: this.state.builderArrived },
      { id: 'world', name: '荒野', unlocked: this.state.worldUnlocked },
    ];
    if (this.state.shipUnlocked) items.push({ id: 'ship', name: '星舰', unlocked: true });
    items.forEach((item, index) => {
      const slot = W / items.length;
      const x = slot * index + slot / 2;
      const active = this.view === item.id;
      const bg = this.add.rectangle(x, 55, slot - 28, 88, active ? 0x24272b : 0x15171a)
        .setStrokeStyle(2, active ? COLORS.emberHex : COLORS.line);
      const text = label(this, x, 55, item.unlocked ? item.name : `${item.name} · 未知`, 26, active ? COLORS.ember : COLORS.dim).setOrigin(0.5);
      if (item.unlocked) {
        bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.showView(item.id));
      } else {
        bg.setAlpha(0.45);
        text.setAlpha(0.45);
      }
      this.nav.add([bg, text]);
    });
  }

  private showView(view: ViewName): void {
    if (view === 'village' && !this.state.builderArrived) return;
    if (view === 'world' && !this.state.worldUnlocked) return;
    if (view === 'ship' && !this.state.shipUnlocked) return;
    this.view = view;
    this.page = 0;
    this.subPage = 0;
    this.root.removeAll(true);
    this.drawNav();
    if (view === 'room') this.drawRoom();
    if (view === 'village') this.drawVillage();
    if (view === 'world') this.drawWorld();
    if (view === 'ship') this.drawShip();
    if (view === 'space') this.drawSpace();
    if (view === 'ending') this.drawEnding();
    this.refreshHeader();
    this.updateMusic();
  }

  private addLog(message: string): void {
    this.state.log.unshift(message);
    this.state.log = this.state.log.slice(0, 10);
  }

  private drawRoom(): void {
    const s = this.state;
    const cx = W / 2;
    const title = label(this, 54, 35, FIRE_NAMES[s.fire], 42, s.fire > 0 ? COLORS.ember : COLORS.text).setFontStyle('bold');
    this.root.add(title);

    const firePanel = panel(this, cx, 285, 972, 400);
    this.root.add(firePanel);
    const fire = this.add.graphics();
    fire.setPosition(cx, 270);
    fire.lineStyle(8, s.fire > 0 ? COLORS.emberHex : 0x3a3f45, 1);
    fire.strokeLineShape(new Phaser.Geom.Line(-90, 105, 90, 105));
    fire.strokeLineShape(new Phaser.Geom.Line(-68, 128, 68, 82));
    fire.strokeLineShape(new Phaser.Geom.Line(-68, 82, 68, 128));
    if (s.fire > 0) {
      fire.fillStyle(0x6c3225, 1);
      fire.fillTriangle(-45, 72, 0, -95 - s.fire * 12, 45, 72);
      fire.fillStyle(COLORS.emberHex, 1);
      fire.fillTriangle(-24, 68, 8, -40 - s.fire * 9, 28, 68);
    }
    this.root.add(fire);
    this.root.add(label(this, cx, 470, s.fire === 0 ? '灰烬是冷的。' : `火焰还能维持约 ${s.fireSeconds} 秒。`, 23, COLORS.dim).setOrigin(0.5));

    const actionY = 570;
    if (s.fire === 0) {
      const light = button(this, cx, actionY, 440, 92, '点燃火堆', () => {
        s.fire = 1;
        s.fireSeconds = 60;
        this.playSfx('light-fire');
        this.addLog('火苗照亮了潮湿的墙。');
        this.showView('room');
      });
      this.root.add(light.root);
    } else {
      const stoke = button(this, 310, actionY, 440, 92, '添柴', () => this.stokeFire());
      stoke.setEnabled(s.stores.wood >= 1 && s.fire < 4);
      const gather = button(this, 770, actionY, 440, 92, s.gatherCooldown > 0 ? `拾取木材 · ${s.gatherCooldown}s` : '拾取木材', () => this.gatherWood());
      gather.setEnabled(s.gatherCooldown <= 0);
      this.root.add([stoke.root, gather.root]);
    }

    if (s.fire >= 2 && !s.builderArrived) {
      const wake = button(this, cx, 690, 900, 92, '照看陌生人', () => {
        s.builderArrived = true;
        s.population = 1;
        s.jobs.gatherer = 1;
        this.addLog('陌生人醒了。她说自己会建造东西。');
        this.showView('village');
      });
      this.root.add(wake.root);
    }

    if (s.builderArrived && s.buildings.trap > 0) {
      const traps = button(this, cx, 690, 900, 92, s.trapCooldown > 0 ? `检查陷阱 · ${s.trapCooldown}s` : '检查陷阱', () => this.checkTraps());
      traps.setEnabled(s.trapCooldown <= 0);
      this.root.add(traps.root);
    }

    const logPanel = panel(this, cx, 1090, 972, 630, 0x111315);
    this.root.add(logPanel);
    this.root.add(label(this, 84, 810, '发生的事', 29).setFontStyle('bold'));
    const logText = this.add.text(84, 865, s.log.map((line, i) => `${i === 0 ? '›' : '·'} ${line}`).join('\n\n'), {
      fontFamily: 'Noto Sans SC, Microsoft YaHei, sans-serif', fontSize: '24px', color: COLORS.dim, lineSpacing: 8,
      wordWrap: { width: 560 }, resolution: Math.min(window.devicePixelRatio || 1, 2),
    }).setScale(1.5);
    this.root.add(logText);

    const reset = button(this, cx, 1490, 360, 72, '重新开始', () => this.confirmRestart());
    reset.bg.setStrokeStyle(1, 0x663d3d);
    reset.text.setColor(COLORS.danger);
    this.root.add(reset.root);
  }

  private stokeFire(): void {
    if (this.state.stores.wood < 1 || this.state.fire >= 4) return;
    this.state.stores.wood -= 1;
    this.state.fire += 1;
    this.state.fireSeconds = 60 + this.state.fire * 20;
    this.playSfx('stoke-fire');
    this.addLog(this.state.fire === 4 ? '火焰咆哮起来。' : '火焰吞下木头，亮了一些。');
    this.showView('room');
  }

  private gatherWood(): void {
    if (this.state.gatherCooldown > 0) return;
    const amount = this.state.buildings.cart ? 50 : 10;
    this.state.stores.wood += amount;
    this.state.gatherCooldown = 60;
    this.playSfx('gather-wood');
    this.addLog(`在林边捡到 ${amount} 根木材。`);
    this.showView('room');
  }

  private checkTraps(): void {
    const s = this.state;
    if (s.trapCooldown > 0 || s.buildings.trap <= 0) return;
    const baitUsed = Math.min(s.stores.bait, s.buildings.trap);
    const rolls = s.buildings.trap + baitUsed;
    const drops: Array<{ limit: number; resource: Resource; name: string }> = [
      { limit: 0.5, resource: 'fur', name: '毛皮' },
      { limit: 0.75, resource: 'meat', name: '肉' },
      { limit: 0.85, resource: 'scales', name: '鳞片' },
      { limit: 0.93, resource: 'teeth', name: '牙齿' },
      { limit: 0.995, resource: 'cloth', name: '布料' },
      { limit: 1, resource: 'charm', name: '护符' },
    ];
    const found = new Map<string, number>();
    for (let i = 0; i < rolls; i += 1) {
      const roll = Math.random();
      const drop = drops.find(item => roll < item.limit) ?? drops[drops.length - 1];
      s.stores[drop.resource] += 1;
      found.set(drop.name, (found.get(drop.name) ?? 0) + 1);
    }
    s.stores.bait -= baitUsed;
    s.trapCooldown = 90;
    this.playSfx('check-traps');
    this.addLog(`陷阱里有${[...found].map(([name, amount]) => `${amount} ${name}`).join('、')}。`);
    this.showView('room');
  }

  private drawVillage(): void {
    const s = this.state;
    this.root.add(label(this, 54, 35, '寂静的村庄', 42).setFontStyle('bold'));
    const capacity = Math.max(1, s.buildings.hut * 4);
    this.root.add(label(this, 54, 88, `人口 ${s.population}/${capacity}  ·  下位流浪者约 ${Math.max(0, s.nextArrival)} 秒后抵达`, 22, COLORS.dim));

    const tabs = [
      { name: '建造', page: 0 },
      { name: '分工', page: 1 },
      { name: '制作', page: 2 },
      { name: '交易', page: 3 },
    ];
    tabs.forEach((item, index) => {
      const b = button(this, 155 + index * 257, 175, 225, 74, item.name, () => { this.page = item.page; this.subPage = 0; this.showVillagePage(); });
      if (this.page === item.page) b.bg.setStrokeStyle(3, COLORS.emberHex);
      this.root.add(b.root);
    });
    this.showVillagePage();
  }

  private showVillagePage(): void {
    const old = this.root.getByName('village-page') as Phaser.GameObjects.Container | null;
    old?.destroy(true);
    const pageRoot = this.add.container(0, 270).setName('village-page');
    this.root.add(pageRoot);
    if (this.page === 0) this.drawBuildingPage(pageRoot);
    if (this.page === 1) this.drawJobsPage(pageRoot);
    if (this.page === 2) this.drawCraftPage(pageRoot);
    if (this.page === 3) this.drawTradePage(pageRoot);
  }

  private drawBuildingPage(root: Phaser.GameObjects.Container): void {
    BUILDINGS.forEach((def, index) => {
      if (def.requires && !this.state.buildings[def.requires]) return;
      const y = 70 + index * 125;
      const bg = panel(this, W / 2, y, 972, 105, index % 2 ? 0x121416 : 0x17191c);
      const count = this.state.buildings[def.id];
      const title = label(this, 76, y - 18, `${def.name}${count ? ` ×${count}` : ''}`, 27);
      const desc = label(this, 76, y + 22, def.description, 20, COLORS.dim);
      const actualCost = this.getBuildCost(def);
      const cost = actualCost.filter(c => c.amount > 0).map(c => `${RESOURCE_NAMES[c.resource]} ${c.amount}`).join(' / ');
      const buy = button(this, 845, y, 310, 68, cost || '建造', () => this.build(def));
      buy.setEnabled(this.canAfford(actualCost) && (!def.max || count < def.max));
      root.add([bg, title, desc, buy.root]);
    });
  }

  private getBuildCost(def: BuildDefinition): Cost[] {
    return typeof def.cost === 'function' ? def.cost(this.state.buildings[def.id]) : def.cost;
  }

  private build(def: BuildDefinition): void {
    const cost = this.getBuildCost(def);
    if (!this.canAfford(cost) || (def.max && this.state.buildings[def.id] >= def.max)) return;
    this.pay(cost);
    this.state.buildings[def.id] += 1;
    this.playSfx('build');
    this.addLog(`${def.name}建成了。村子显得没那么荒凉。`);
    this.showView('village');
  }

  private availableJobs(): Job[] {
    const b = this.state.buildings;
    const jobs: Job[] = ['gatherer'];
    if (b.lodge) jobs.push('hunter', 'trapper');
    if (b.tannery) jobs.push('tanner');
    if (b.smokehouse) jobs.push('charcutier');
    if (this.hasClearedTile('I')) jobs.push('ironMiner');
    if (this.hasClearedTile('C')) jobs.push('coalMiner');
    if (this.hasClearedTile('S')) jobs.push('sulphurMiner');
    if (b.steelworks) jobs.push('steelworker');
    if (b.armoury) jobs.push('armourer');
    return jobs;
  }

  private hasClearedTile(tile: string): boolean {
    return this.state.world.cleared.some(key => {
      const [x, y] = key.split(',').map(Number);
      return getWorldTile(this.state.world.map, x, y) === tile;
    });
  }

  private drawJobsPage(root: Phaser.GameObjects.Container): void {
    const assigned = Object.values(this.state.jobs).reduce((a, b) => a + b, 0);
    root.add(label(this, 54, 25, `空闲人口 ${Math.max(0, this.state.population - assigned)}`, 24, COLORS.dim));
    this.availableJobs().forEach((job, index) => {
      const y = 110 + index * 126;
      const bg = panel(this, W / 2, y, 972, 104, index % 2 ? 0x121416 : 0x17191c);
      const rates = Object.entries(JOB_PRODUCTION[job]).map(([r, value]) => `${RESOURCE_NAMES[r as Resource]} ${Number(value) >= 0 ? '+' : ''}${value}/10秒`).join('  ');
      const name = label(this, 76, y - 15, `${JOB_NAMES[job]}  ${this.state.jobs[job]}`, 27);
      const rate = label(this, 76, y + 24, rates, 19, COLORS.dim);
      const minus = button(this, 775, y, 86, 68, '－', () => this.changeJob(job, -1));
      const plus = button(this, 920, y, 86, 68, '＋', () => this.changeJob(job, 1));
      minus.setEnabled(this.state.jobs[job] > 0);
      plus.setEnabled(assigned < this.state.population);
      root.add([bg, name, rate, minus.root, plus.root]);
    });
  }

  private changeJob(job: Job, delta: number): void {
    const assigned = Object.values(this.state.jobs).reduce((a, b) => a + b, 0);
    if (delta > 0 && assigned >= this.state.population) return;
    if (delta < 0 && this.state.jobs[job] <= 0) return;
    this.state.jobs[job] += delta;
    this.showView('village');
    this.page = 1;
    this.showVillagePage();
  }

  private drawCraftPage(root: Phaser.GameObjects.Container): void {
    if (!this.state.buildings.workshop) {
      root.add(label(this, W / 2, 150, '建造工坊后，才能制作远行装备。', 26, COLORS.dim).setOrigin(0.5));
      return;
    }
    const pageSize = 7;
    const pageCount = Math.ceil(CRAFTS.length / pageSize);
    const visible = CRAFTS.slice(this.subPage * pageSize, (this.subPage + 1) * pageSize);
    visible.forEach((def, index) => {
      const y = 85 + index * 150;
      const bg = panel(this, W / 2, y, 972, 110, index % 2 ? 0x121416 : 0x17191c);
      const owned = def.id === 'torch' ? this.state.stores.torch : this.state.crafted[def.id] ?? 0;
      const title = label(this, 76, y - 19, `${def.name}${owned ? ' · 已拥有' : ''}`, 27);
      const desc = label(this, 76, y + 22, def.description, 20, COLORS.dim);
      const cost = def.cost.map(c => `${RESOURCE_NAMES[c.resource]} ${c.amount}`).join(' / ');
      const craft = button(this, 825, y, 350, 70, cost, () => this.craft(def));
      craft.setEnabled(this.canAfford(def.cost) && (!def.max || owned < def.max));
      root.add([bg, title, desc, craft.root]);
    });
    this.drawPager(root, pageCount, 1175);
  }

  private craft(def: CraftDefinition): void {
    const owned = def.id === 'torch' ? this.state.stores.torch : this.state.crafted[def.id] ?? 0;
    if (!this.canAfford(def.cost) || (def.max && owned >= def.max)) return;
    this.pay(def.cost);
    if (def.id === 'torch') {
      this.state.stores.torch += def.quantity ?? 1;
    } else {
      this.state.crafted[def.id] = owned + (def.quantity ?? 1);
    }
    this.playSfx('craft');
    this.addLog(`${def.name}制作完成。`);
    this.showView('village');
    this.page = 2;
    this.showVillagePage();
  }

  private drawTradePage(root: Phaser.GameObjects.Container): void {
    if (!this.state.buildings.tradingPost) {
      root.add(label(this, W / 2, 150, '建造交易站后，商队才会来到村庄。', 26, COLORS.dim).setOrigin(0.5));
      return;
    }
    const pageSize = 7;
    const pageCount = Math.ceil(TRADES.length / pageSize);
    const visible = TRADES.slice(this.subPage * pageSize, (this.subPage + 1) * pageSize);
    visible.forEach((def, index) => {
      const y = 85 + index * 150;
      const bg = panel(this, W / 2, y, 972, 110, index % 2 ? 0x121416 : 0x17191c);
      const owned = this.getTradeOwned(def);
      const title = label(this, 76, y - 19, `${def.name}${owned ? ` ×${formatAmount(owned)}` : ''}`, 27);
      const cost = def.cost.map(c => `${RESOURCE_NAMES[c.resource]} ${c.amount}`).join(' / ');
      const buy = button(this, 825, y, 350, 70, cost, () => this.trade(def));
      buy.setEnabled(this.canAfford(def.cost) && (!def.max || owned < def.max));
      root.add([bg, title, buy.root]);
    });
    this.drawPager(root, pageCount, 1175);
  }

  private getTradeOwned(def: TradeDefinition): number {
    return def.id in this.state.stores
      ? this.state.stores[def.id as Resource]
      : this.state.crafted[def.id] ?? 0;
  }

  private trade(def: TradeDefinition): void {
    const owned = this.getTradeOwned(def);
    if (!this.canAfford(def.cost) || (def.max && owned >= def.max)) return;
    this.pay(def.cost);
    if (def.id in this.state.stores) {
      this.state.stores[def.id as Resource] += def.quantity ?? 1;
    } else {
      this.state.crafted[def.id] = owned + (def.quantity ?? 1);
    }
    this.playSfx('buy');
    if (def.id === 'compass') {
      this.state.worldUnlocked = true;
      this.addLog('罗盘指针颤动着，荒野不再是一团迷雾。');
    } else {
      this.addLog(`商队交付了${def.name}。`);
    }
    this.showView('village');
    this.page = 3;
    this.showVillagePage();
  }

  private drawPager(root: Phaser.GameObjects.Container, pageCount: number, y: number): void {
    if (pageCount <= 1) return;
    const previous = button(this, 335, y, 260, 70, '上一页', () => {
      this.subPage = Math.max(0, this.subPage - 1);
      this.showVillagePage();
    });
    const next = button(this, 745, y, 260, 70, '下一页', () => {
      this.subPage = Math.min(pageCount - 1, this.subPage + 1);
      this.showVillagePage();
    });
    previous.setEnabled(this.subPage > 0);
    next.setEnabled(this.subPage < pageCount - 1);
    root.add([previous.root, label(this, W / 2, y, `${this.subPage + 1} / ${pageCount}`, 22, COLORS.dim).setOrigin(0.5), next.root]);
  }

  private canAfford(cost: Array<{ resource: Resource; amount: number }>): boolean {
    return cost.every(item => this.state.stores[item.resource] >= item.amount);
  }

  private pay(cost: Array<{ resource: Resource; amount: number }>): void {
    cost.forEach(item => { this.state.stores[item.resource] -= item.amount; });
  }

  private drawWorld(): void {
    if (!this.state.world.active) {
      this.drawEmbark();
      return;
    }
    if (this.activeEnemy) {
      this.drawCombat();
      return;
    }
    if (this.pendingLandmark) {
      this.drawLandmarkEvent();
      return;
    }
    const world = this.state.world;
    this.root.add(label(this, 54, 35, '无声的荒野', 42).setFontStyle('bold'));
    this.root.add(label(this, 54, 90, `生命 ${world.hp}/${world.maxHp}   熏肉 ${world.food}   水 ${world.water}   行程 ${world.steps}`, 23, COLORS.dim));
    const gridRoot = this.add.container(0, 160);
    this.root.add(gridRoot);
    const gridSize = 13;
    const cell = 66;
    const ox = W / 2 - (gridSize * cell) / 2 + cell / 2;
    const oy = 60;
    for (let gy = 0; gy < gridSize; gy += 1) {
      for (let gx = 0; gx < gridSize; gx += 1) {
        const wx = world.x + gx - 6;
        const wy = world.y + gy - 6;
        const key = `${wx},${wy}`;
        const seen = world.visited.includes(key) || Math.abs(wx - world.x) + Math.abs(wy - world.y) <= 2;
        const current = wx === world.x && wy === world.y;
        const home = wx === 0 && wy === 0;
        const tile = getWorldTile(world.map, wx, wy);
        const landmark = getLandmark(tile);
        const cleared = world.cleared.includes(key);
        const x = ox + gx * cell;
        const y = oy + gy * cell;
        const bg = this.add.rectangle(x, y, cell - 4, cell - 4, current ? 0x34251f : seen ? 0x17191c : 0x101113)
          .setStrokeStyle(1, current ? COLORS.emberHex : 0x292c30);
        let icon = seen ? (tile ?? '·') : ' ';
        if (home && seen) icon = 'A';
        if (landmark && seen) icon = cleared ? '✓' : landmark.tile;
        if (current) icon = '@';
        const txt = label(this, x, y, icon, current ? 28 : 22, current ? COLORS.ember : cleared ? COLORS.good : COLORS.text).setOrigin(0.5);
        gridRoot.add([bg, txt]);
      }
    }
    const help = label(this, W / 2, 955, '@ 你   A 村庄   字母 地标   ✓ 已探索', 21, COLORS.dim).setOrigin(0.5);
    this.root.add(help);
    const up = button(this, 540, 1055, 160, 80, '↑', () => this.moveWorld(0, -1));
    const left = button(this, 350, 1150, 160, 80, '←', () => this.moveWorld(-1, 0));
    const down = button(this, 540, 1150, 160, 80, '↓', () => this.moveWorld(0, 1));
    const right = button(this, 730, 1150, 160, 80, '→', () => this.moveWorld(1, 0));
    this.root.add([up.root, left.root, down.root, right.root]);
    if (world.x === 0 && world.y === 0) {
      const home = button(this, W / 2, 1300, 480, 82, '返回村庄', () => this.returnHome());
      this.root.add(home.root);
    }
  }

  private drawEmbark(): void {
    this.root.add(label(this, 54, 35, '踏入荒野', 42).setFontStyle('bold'));
    const maxFood = this.getCarryCapacity();
    const maxWater = this.getWaterCapacity();
    const ready = this.state.stores.curedMeat >= maxFood;
    const p = panel(this, W / 2, 390, 972, 480);
    this.root.add(p);
    this.root.add(label(this, W / 2, 250, '尘土覆盖着村庄之外的一切。', 30).setOrigin(0.5));
    this.root.add(label(this, W / 2, 320, '每移动两步消耗 1 份熏肉，每步消耗 1 份水。\n带回地标中的物资，才能继续发展村庄。', 23, COLORS.dim).setOrigin(0.5).setAlign('center'));
    this.root.add(label(this, W / 2, 450, `本次补给：熏肉 ${maxFood}  ·  水 ${maxWater}`, 26));
    const go = button(this, W / 2, 590, 520, 90, ready ? '出发' : `还需要 ${Math.max(0, maxFood - Math.floor(this.state.stores.curedMeat))} 熏肉`, () => this.embark());
    go.setEnabled(ready);
    this.root.add(go.root);
  }

  private embark(): void {
    const maxFood = this.getCarryCapacity();
    if (this.state.stores.curedMeat < maxFood) return;
    this.state.stores.curedMeat -= maxFood;
    const world = this.state.world;
    world.active = true;
    world.x = 0; world.y = 0; world.steps = 0;
    world.maxHp = this.getMaxHealth();
    world.hp = world.maxHp;
    world.food = maxFood;
    world.water = this.getWaterCapacity();
    world.visited = Array.from(new Set([...world.visited, '0,0']));
    this.addLog('带着有限的补给，旅人踏入荒野。');
    this.playSfx('embark');
    this.showView('world');
  }

  private getCarryCapacity(): number {
    if (this.state.crafted.convoy) return 70;
    if (this.state.crafted.wagon) return 40;
    if (this.state.crafted.rucksack) return 20;
    return 10;
  }

  private getWaterCapacity(): number {
    if (this.state.crafted.waterTank) return 100;
    if (this.state.crafted.cask) return 30;
    if (this.state.crafted.waterskin) return 20;
    return 10;
  }

  private getMaxHealth(): number {
    if (this.state.crafted.sArmour) return 55;
    if (this.state.crafted.iArmour) return 35;
    if (this.state.crafted.lArmour) return 15;
    return 10;
  }

  private moveWorld(dx: number, dy: number): void {
    const w = this.state.world;
    if (!w.active || this.activeEnemy) return;
    if (Math.abs(w.x + dx) > WORLD_RADIUS || Math.abs(w.y + dy) > WORLD_RADIUS) return;
    w.x += dx; w.y += dy; w.steps += 1;
    this.playSfx(`footsteps-${Phaser.Math.Between(1, 6)}`);
    if (w.steps % 2 === 0) w.food = Math.max(0, w.food - 1);
    w.water = Math.max(0, w.water - 1);
    const key = `${w.x},${w.y}`;
    if (!w.visited.includes(key)) w.visited.push(key);
    if (w.food === 0 || w.water === 0) w.hp -= 2;
    if (w.hp <= 0) {
      this.collapse();
      return;
    }
    const landmark = getLandmark(getWorldTile(w.map, w.x, w.y));
    if (landmark && !w.cleared.includes(key)) {
      this.pendingLandmark = {
        tile: landmark.tile,
        key,
        name: landmark.name,
        danger: landmark.danger,
        stage: 'intro',
        loot: this.getLandmarkLoot(landmark.tile),
      };
      this.playSfx(LANDMARK_AUDIO[landmark.tile] ?? 'encounter-tier-1');
      this.showView('world');
      return;
    }
    const distance = Math.abs(w.x) + Math.abs(w.y);
    if (distance > 1 && Math.random() < 0.2) {
      const enemies = ['饥饿的野兽', '持刀的流浪者', '灰尘中的蜥蜴'];
      const danger = 6 + Math.min(16, Math.floor(distance * 1.3));
      this.startCombat(Phaser.Utils.Array.GetRandom(enemies), danger, { curedMeat: 3 + Math.floor(distance / 2), fur: 2 });
      return;
    }
    this.showView('world');
  }

  private drawLandmarkEvent(): void {
    const event = this.pendingLandmark;
    if (!event) return;
    const text = LANDMARK_TEXT[event.tile] ?? { intro: event.name, approach: '探索', cleared: '这里已经安全。' };
    this.root.add(label(this, 54, 35, event.name, 42).setFontStyle('bold'));
    const eventPanel = panel(this, W / 2, 480, 972, 700, 0x151315);
    this.root.add(eventPanel);
    if (event.stage === 'intro') {
      this.root.add(label(this, W / 2, 270, text.intro, 28, COLORS.dim).setOrigin(0.5).setWordWrapWidth(820).setAlign('center'));
      const needsTorch = event.tile === 'V' && this.state.stores.torch <= 0;
      const enter = button(this, W / 2, 470, 560, 92, needsTorch ? '需要一支火把' : text.approach, () => this.enterLandmark());
      enter.setEnabled(!needsTorch);
      const leave = button(this, W / 2, 610, 420, 74, '暂时离开', () => {
        this.pendingLandmark = null;
        this.showView('world');
      });
      this.root.add([enter.root, leave.root]);
      return;
    }

    this.root.add(label(this, W / 2, 255, text.cleared, 28, COLORS.dim).setOrigin(0.5).setWordWrapWidth(820).setAlign('center'));
    const lootText = Object.entries(event.loot).map(([resource, amount]) => `${RESOURCE_NAMES[resource as Resource]} ${amount}`).join('  ·  ');
    this.root.add(label(this, W / 2, 390, lootText || '没有找到可以带走的东西', 25, COLORS.good).setOrigin(0.5).setWordWrapWidth(820).setAlign('center'));
    const take = button(this, W / 2, 570, 560, 92, '带走物资', () => this.finishLandmark());
    this.root.add(take.root);
  }

  private enterLandmark(): void {
    const event = this.pendingLandmark;
    if (!event || event.stage !== 'intro') return;
    if (event.tile === 'V') {
      if (this.state.stores.torch <= 0) return;
      this.state.stores.torch -= 1;
    }
    this.startCombat(event.name, event.danger, event.loot, event.key);
  }

  private finishLandmark(): void {
    const event = this.pendingLandmark;
    if (!event || event.stage !== 'reward') return;
    Object.entries(event.loot).forEach(([resource, amount]) => {
      this.state.stores[resource as Resource] += amount ?? 0;
    });
    if (!this.state.world.cleared.includes(event.key)) this.state.world.cleared.push(event.key);
    if (event.tile === 'W') {
      this.state.shipUnlocked = true;
      this.addLog('星舰的控制台重新亮起。村庄外出现了一条通往船体的路。');
    }
    this.addLog(`${event.name}已经清理，物资被带回行囊。`);
    this.pendingLandmark = null;
    this.showView('world');
  }

  private getLandmarkLoot(tile: string): Partial<Record<Resource, number>> {
    const loot: Record<string, Partial<Record<Resource, number>>> = {
      I: { iron: 60, curedMeat: 5 }, C: { coal: 60, curedMeat: 5 }, S: { sulphur: 60, curedMeat: 5 },
      H: { curedMeat: 10, cloth: 3, medicine: 1 }, V: { fur: 15, meat: 10, teeth: 2 },
      O: { iron: 20, steel: 10, medicine: 2, bullets: 5 },
      Y: { steel: 30, medicine: 4, bullets: 10, energyCell: 2 },
      W: { steel: 50, alienAlloy: 1, energyCell: 5 }, B: { medicine: 3, iron: 20 },
      F: { bullets: 20, grenade: 1, steel: 15 }, M: { medicine: 5, scales: 10, charm: 1 },
      X: { alienAlloy: 2, energyCell: 10, steel: 50 },
    };
    return loot[tile] ?? {};
  }

  private startCombat(name: string, hp: number, loot: Partial<Record<Resource, number>>, landmarkKey?: string): void {
    this.activeEnemy = { name, hp, maxHp: hp, damage: Math.max(1, Math.floor(hp / 7)), nextAttack: Date.now() + 1600, stunnedUntil: 0, loot, landmarkKey };
    this.actionReadyAt = {};
    this.playSfx(hp < 12 ? 'encounter-tier-1' : hp < 22 ? 'encounter-tier-2' : 'encounter-tier-3');
    this.showView('world');
  }

  private drawCombat(): void {
    const enemy = this.activeEnemy;
    if (!enemy) return;
    const w = this.state.world;
    this.root.add(label(this, 54, 35, '遭遇', 42, COLORS.danger).setFontStyle('bold'));
    const p = panel(this, W / 2, 680, 972, 1080, 0x151315);
    this.root.add(p);
    this.root.add(label(this, W / 2, 210, enemy.name, 38).setOrigin(0.5));
    this.root.add(label(this, W / 2, 275, `敌人  ${enemy.hp}/${enemy.maxHp}${enemy.stunnedUntil > Date.now() ? ' · 眩晕' : ''}`, 27, COLORS.danger).setOrigin(0.5));
    this.root.add(label(this, W / 2, 325, `旅人  ${w.hp}/${w.maxHp}`, 27, COLORS.good).setOrigin(0.5));
    this.root.add(label(this, 82, 390, '武器', 25).setFontStyle('bold'));

    const weapons = this.getAvailableWeapons();
    weapons.forEach((weapon, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column ? 795 : 285;
      const y = 465 + row * 104;
      const readyIn = Math.max(0, Math.ceil(((this.actionReadyAt[weapon.id] ?? 0) - Date.now()) / 1000));
      const ammo = weapon.ammo ? ` · ${RESOURCE_NAMES[weapon.ammo]} ${formatAmount(this.state.stores[weapon.ammo])}` : '';
      const damage = weapon.damage === 'stun' ? '眩晕' : `${weapon.damage} 伤害`;
      const attack = button(this, x, y, 430, 78, `${weapon.name} · ${damage}${readyIn ? ` · ${readyIn}s` : ammo}`, () => this.attack(weapon));
      attack.setEnabled(readyIn <= 0 && (!weapon.ammo || this.state.stores[weapon.ammo] > 0));
      this.root.add(attack.root);
    });

    const healY = 465 + Math.ceil(weapons.length / 2) * 104 + 40;
    this.root.add(label(this, 82, healY, '恢复', 25).setFontStyle('bold'));
    const meatReady = Math.max(0, Math.ceil(((this.actionReadyAt.meat ?? 0) - Date.now()) / 1000));
    const eat = button(this, 285, healY + 80, 430, 78, `吃熏肉 · +8${meatReady ? ` · ${meatReady}s` : ` · 剩余 ${w.food}`}`, () => this.heal('meat'));
    eat.setEnabled(w.food > 0 && w.hp < w.maxHp && meatReady <= 0);
    const medsReady = Math.max(0, Math.ceil(((this.actionReadyAt.medicine ?? 0) - Date.now()) / 1000));
    const meds = button(this, 795, healY + 80, 430, 78, `使用药剂 · +20${medsReady ? ` · ${medsReady}s` : ` · 库存 ${formatAmount(this.state.stores.medicine)}`}`, () => this.heal('medicine'));
    meds.setEnabled(this.state.stores.medicine > 0 && w.hp < w.maxHp && medsReady <= 0);
    this.root.add([eat.root, meds.root]);

    const flee = button(this, W / 2, Math.min(1450, healY + 205), 420, 72, '逃跑（失去 3 生命）', () => {
      w.hp -= 3;
      this.activeEnemy = null;
      this.pendingLandmark = null;
      if (w.hp <= 0) this.collapse(); else this.showView('world');
    });
    this.root.add(flee.root);
  }

  private attack(weapon: WeaponDefinition): void {
    const enemy = this.activeEnemy;
    if (!enemy || Date.now() < (this.actionReadyAt[weapon.id] ?? 0)) return;
    if (weapon.ammo && this.state.stores[weapon.ammo] <= 0) return;
    if (weapon.ammo) this.state.stores[weapon.ammo] -= 1;
    const soundType = weapon.id === 'fists' ? 'unarmed' : weapon.ammo ? 'ranged' : 'melee';
    this.playSfx(`weapon-${soundType}-${Phaser.Math.Between(1, 3)}`);
    if (weapon.damage === 'stun') {
      enemy.stunnedUntil = Date.now() + 4000;
    } else if (Math.random() <= 0.8) {
      enemy.hp -= weapon.damage;
    }
    this.actionReadyAt[weapon.id] = Date.now() + weapon.cooldown * 1000;
    if (enemy.hp <= 0) {
      this.activeEnemy = null;
      if (enemy.landmarkKey && this.pendingLandmark?.key === enemy.landmarkKey) {
        this.pendingLandmark.stage = 'reward';
      } else {
        Object.entries(enemy.loot).forEach(([key, value]) => { this.state.stores[key as Resource] += value ?? 0; });
        this.addLog(`从${enemy.name}身上搜到了一些物资。`);
      }
      this.showView('world');
      return;
    }
    this.showView('world');
  }

  private getAvailableWeapons(): WeaponDefinition[] {
    const owned = WEAPONS.filter(weapon => {
      if (weapon.id === 'fists') return false;
      if (weapon.permanent) return (this.state.crafted[weapon.permanent] ?? 0) > 0;
      return weapon.ammo ? this.state.stores[weapon.ammo] > 0 : false;
    });
    return owned.length ? owned : [WEAPONS[0]];
  }

  private heal(kind: 'meat' | 'medicine'): void {
    const world = this.state.world;
    if (world.hp >= world.maxHp) return;
    if (kind === 'meat') {
      if (world.food <= 0 || Date.now() < (this.actionReadyAt.meat ?? 0)) return;
      world.food -= 1;
      this.playSfx('eat-meat');
      world.hp = Math.min(world.maxHp, world.hp + 8);
      this.actionReadyAt.meat = Date.now() + 5000;
    } else {
      if (this.state.stores.medicine <= 0 || Date.now() < (this.actionReadyAt.medicine ?? 0)) return;
      this.state.stores.medicine -= 1;
      this.playSfx('use-meds');
      world.hp = Math.min(world.maxHp, world.hp + 20);
      this.actionReadyAt.medicine = Date.now() + 7000;
    }
    this.showView('world');
  }

  private collapse(): void {
    const w = this.state.world;
    w.active = false; w.x = 0; w.y = 0; w.hp = w.maxHp; w.food = 0; w.water = 0;
    this.activeEnemy = null;
    this.pendingLandmark = null;
    this.playSfx('death');
    this.addLog('旅人在荒野中倒下，醒来时已回到火堆旁。');
    this.showView('room');
  }

  private returnHome(): void {
    const w = this.state.world;
    w.active = false; w.x = 0; w.y = 0;
    this.pendingLandmark = null;
    this.addLog('旅人回到了村庄。');
    this.persist(false);
    this.showView('village');
  }

  private drawShip(): void {
    const ship = this.state.ship;
    this.root.add(label(this, 54, 35, '一艘旧星舰', 42).setFontStyle('bold'));
    const shipPanel = panel(this, W / 2, 440, 972, 720, 0x111315);
    this.root.add(shipPanel);
    this.root.add(label(this, W / 2, 190, '@', 88, COLORS.ember).setOrigin(0.5));
    this.root.add(label(this, 110, 300, '船体', 28));
    this.root.add(label(this, 930, 300, `${ship.hull}`, 28).setOrigin(1, 0));
    this.root.add(label(this, 110, 360, '引擎', 28));
    this.root.add(label(this, 930, 360, `${ship.thrusters}`, 28).setOrigin(1, 0));
    this.root.add(label(this, W / 2, 430, `外星合金 ${formatAmount(this.state.stores.alienAlloy)}`, 23, COLORS.dim).setOrigin(0.5));

    const hull = button(this, W / 2, 530, 620, 82, '加固船体 · 外星合金 1', () => this.upgradeShip('hull'));
    hull.setEnabled(this.state.stores.alienAlloy >= 1);
    const engine = button(this, W / 2, 640, 620, 82, '升级引擎 · 外星合金 1', () => this.upgradeShip('thrusters'));
    engine.setEnabled(this.state.stores.alienAlloy >= 1);
    const launch = button(this, W / 2, 810, 620, 94, ship.hull > 0 ? '起飞 · 离开这里' : '至少需要 1 层船体', () => this.launchShip());
    launch.setEnabled(ship.hull > 0);
    this.root.add([hull.root, engine.root, launch.root]);
  }

  private upgradeShip(part: 'hull' | 'thrusters'): void {
    if (this.state.stores.alienAlloy < 1) return;
    this.state.stores.alienAlloy -= 1;
    this.state.ship[part] += 1;
    this.playSfx(part === 'hull' ? 'reinforce-hull' : 'upgrade-engine');
    this.addLog(part === 'hull' ? '外星合金被焊进破损的船体。' : '引擎发出更稳定的低鸣。');
    this.showView('ship');
  }

  private launchShip(): void {
    const ship = this.state.ship;
    if (ship.hull <= 0) return;
    ship.inFlight = true;
    ship.flightHull = ship.hull;
    ship.altitude = 0;
    this.playSfx('lift-off');
    this.persist(false);
    this.showView('space');
  }

  private drawSpace(): void {
    const ship = this.state.ship;
    this.root.add(this.add.rectangle(W / 2, 700, W, 1400, 0x050608));
    for (let index = 0; index < 100; index += 1) {
      const star = label(this, Phaser.Math.Between(10, W - 10), Phaser.Math.Between(40, 1320), '·', Phaser.Math.Between(12, 22), index % 3 ? '#696d75' : '#d8dbe2').setOrigin(0.5);
      this.root.add(star);
    }
    this.root.add(label(this, 45, 30, '上升', 36).setFontStyle('bold'));
    this.spaceHullText = label(this, 45, 85, `船体 ${ship.flightHull}/${ship.hull}`, 24, COLORS.good);
    this.spaceAltitudeText = label(this, W - 45, 85, `高度 ${ship.altitude}/60`, 24, COLORS.dim).setOrigin(1, 0);
    this.root.add([this.spaceHullText, this.spaceAltitudeText]);
    this.spaceShipObject = this.add.rectangle(W / 2, 1050, 54, 76, COLORS.emberHex).setStrokeStyle(3, 0xe6e1d8);
    this.root.add(this.spaceShipObject);
    this.spaceAsteroids.clear();

    const controls = [
      { key: 'up' as const, x: 540, y: 1280, text: '↑' },
      { key: 'left' as const, x: 350, y: 1370, text: '←' },
      { key: 'down' as const, x: 540, y: 1370, text: '↓' },
      { key: 'right' as const, x: 730, y: 1370, text: '→' },
    ];
    controls.forEach(control => {
      const part = button(this, control.x, control.y, 150, 74, control.text, () => undefined);
      part.bg.on('pointerdown', () => { this.spaceDirection[control.key] = true; });
      part.bg.on('pointerup', () => { this.spaceDirection[control.key] = false; });
      part.bg.on('pointerout', () => { this.spaceDirection[control.key] = false; });
      this.root.add(part.root);
    });
  }

  private updateSpace(): void {
    if (this.view !== 'space' || !this.state.ship.inFlight || !this.spaceShipObject) return;
    const speed = 3 + this.state.ship.thrusters;
    const left = this.spaceDirection.left || !!this.cursors?.left.isDown;
    const right = this.spaceDirection.right || !!this.cursors?.right.isDown;
    const up = this.spaceDirection.up || !!this.cursors?.up.isDown;
    const down = this.spaceDirection.down || !!this.cursors?.down.isDown;
    let dx = (right ? speed : 0) - (left ? speed : 0);
    let dy = (down ? speed : 0) - (up ? speed : 0);
    if (dx && dy) { dx /= Math.sqrt(2); dy /= Math.sqrt(2); }
    this.spaceShipObject.x = Phaser.Math.Clamp(this.spaceShipObject.x + dx, 35, W - 35);
    this.spaceShipObject.y = Phaser.Math.Clamp(this.spaceShipObject.y + dy, 150, 1180);
    for (const asteroid of [...this.spaceAsteroids]) {
      if (!asteroid.active) { this.spaceAsteroids.delete(asteroid); continue; }
      if (Math.abs(asteroid.x - this.spaceShipObject.x) < 38 && Math.abs(asteroid.y - this.spaceShipObject.y) < 46) {
        this.spaceAsteroids.delete(asteroid);
        asteroid.destroy();
        this.state.ship.flightHull -= 1;
        const tier = this.state.ship.altitude > 40 ? Phaser.Math.Between(7, 8) : this.state.ship.altitude > 20 ? Phaser.Math.Between(5, 6) : Phaser.Math.Between(1, 2);
        this.playSfx(`asteroid-hit-${tier}`);
        this.spaceHullText?.setText(`船体 ${this.state.ship.flightHull}/${this.state.ship.hull}`);
        if (this.state.ship.flightHull <= 0) this.crashShip();
      }
    }
  }

  private spawnAsteroidWave(): void {
    if (this.view !== 'space' || !this.state.ship.inFlight) return;
    const altitude = this.state.ship.altitude;
    const count = 1 + (altitude > 10 ? 1 : 0) + (altitude > 20 ? 2 : 0) + (altitude > 40 ? 2 : 0);
    for (let index = 0; index < count; index += 1) {
      const asteroid = label(this, Phaser.Math.Between(35, W - 35), 130, Phaser.Utils.Array.GetRandom(['#', '$', '%', '&', 'H']), 34, '#b8b2a8').setOrigin(0.5);
      this.root.add(asteroid);
      this.spaceAsteroids.add(asteroid);
      this.tweens.add({
        targets: asteroid,
        y: 1250,
        duration: 1500 - Phaser.Math.Between(0, 975),
        ease: 'Linear',
        onComplete: () => { this.spaceAsteroids.delete(asteroid); asteroid.destroy(); },
      });
    }
  }

  private crashShip(): void {
    if (!this.state.ship.inFlight) return;
    this.state.ship.inFlight = false;
    this.state.ship.altitude = 0;
    this.spaceAsteroids.clear();
    this.playSfx('crash');
    this.addLog('星舰被陨石撕开，只能坠回荒原。');
    this.persist(false);
    this.showView('ship');
  }

  private completeFlight(): void {
    const score = this.calculateScore();
    this.state.ship.inFlight = false;
    this.state.gameWon = true;
    this.state.score = score;
    this.state.totalScore += score;
    this.persist(false);
    this.showView('ending');
  }

  private calculateScore(): number {
    const s = this.state;
    const weighted: Array<[number, number]> = [
      [s.stores.wood, 1], [s.stores.fur, 1.5], [s.stores.meat, 1], [s.stores.iron, 2],
      [s.stores.coal, 2], [s.stores.sulphur, 3], [s.stores.steel, 3], [s.stores.curedMeat, 2],
      [s.stores.scales, 2], [s.stores.teeth, 2], [s.stores.leather, 2], [s.stores.bait, 1.5],
      [s.stores.torch, 1], [s.stores.cloth, 1], [s.crafted.boneSpear ?? 0, 10],
      [s.crafted.ironSword ?? 0, 30], [s.crafted.steelSword ?? 0, 50], [s.crafted.bayonet ?? 0, 100],
      [s.crafted.rifle ?? 0, 150], [s.crafted.laserRifle ?? 0, 150], [s.stores.bullets, 3],
      [s.stores.energyCell, 3], [s.stores.grenade, 5], [s.stores.bolas, 4],
    ];
    return Math.floor(weighted.reduce((total, [amount, factor]) => total + amount * factor, 0) + s.stores.alienAlloy * 10 + s.ship.hull * 50);
  }

  private drawEnding(): void {
    this.root.add(label(this, W / 2, 210, '群星之间', 48).setOrigin(0.5).setFontStyle('bold'));
    this.root.add(label(this, W / 2, 390, '星舰穿过最后一层碎片云。\n荒原在身后缩成一个暗点。', 30, COLORS.dim).setOrigin(0.5).setAlign('center'));
    this.root.add(label(this, W / 2, 610, `本轮得分  ${this.state.score}`, 34, COLORS.good).setOrigin(0.5));
    this.root.add(label(this, W / 2, 680, `累计得分  ${this.state.totalScore}`, 30).setOrigin(0.5));
    const restart = button(this, W / 2, 860, 520, 90, '重新开始', () => {
      const totalScore = this.state.totalScore;
      clearState();
      this.state = freshState();
      this.state.totalScore = totalScore;
      this.persist(false);
      this.showView('room');
    });
    this.root.add(restart.root);
  }

  private tick(): void {
    const s = this.state;
    if (s.ship.inFlight && this.view === 'space') {
      s.ship.altitude += 1;
      this.spaceAltitudeText?.setText(`高度 ${s.ship.altitude}/60`);
      if (s.ship.altitude >= 60) {
        this.completeFlight();
        return;
      }
    }
    if (s.gatherCooldown > 0) s.gatherCooldown -= 1;
    if (s.trapCooldown > 0) s.trapCooldown -= 1;
    if (s.fire > 0) {
      s.fireSeconds -= 1;
      if (s.fireSeconds <= 0) {
        s.fire -= 1;
        s.fireSeconds = s.fire > 0 ? 45 + s.fire * 15 : 0;
        this.addLog(s.fire ? '火势渐渐弱了。' : '火熄灭了。');
      }
    }
    s.productionTimer -= 1;
    if (s.productionTimer <= 0) {
      this.produce();
      s.productionTimer = 10;
    }
    this.handlePopulation();
    this.handleEnemyAttack();
    this.refreshHeader();
    if (this.view === 'room' || this.view === 'world' && this.activeEnemy) this.showView(this.view);
  }

  private produce(): void {
    (Object.keys(this.state.jobs) as Job[]).forEach(job => {
      const workers = this.state.jobs[job];
      if (!workers) return;
      const changes = Object.entries(JOB_PRODUCTION[job]).map(([key, rate]) => ({
        resource: key as Resource,
        delta: (rate ?? 0) * workers,
      }));
      if (!changes.every(change => change.delta >= 0 || this.state.stores[change.resource] >= Math.abs(change.delta))) return;
      changes.forEach(({ resource, delta }) => {
        this.state.stores[resource] = Math.max(0, this.state.stores[resource] + delta);
      });
    });
  }

  private handlePopulation(): void {
    if (!this.state.builderArrived) return;
    const capacity = Math.max(1, this.state.buildings.hut * 4);
    if (this.state.population >= capacity) return;
    this.state.nextArrival -= 1;
    if (this.state.nextArrival <= 0) {
      const space = capacity - this.state.population;
      const arrivals = Math.max(1, Math.floor(Math.random() * (space / 2) + space / 2));
      this.state.population += arrivals;
      this.state.jobs.gatherer += arrivals;
      this.state.nextArrival = Phaser.Math.Between(30, 180);
      this.addLog(arrivals === 1 ? '一位陌生人在夜里抵达。' : `${arrivals} 位疲惫的流浪者来到村庄。`);
    }
  }

  private handleEnemyAttack(): void {
    const enemy = this.activeEnemy;
    if (!enemy || Date.now() < enemy.nextAttack) return;
    if (Date.now() < enemy.stunnedUntil) return;
    this.state.world.hp -= enemy.damage;
    enemy.nextAttack = Date.now() + 1600;
    if (this.state.world.hp <= 0) this.collapse();
  }

  private playSfx(key: string): void {
    if (!this.cache.audio.exists(key)) return;
    this.sound.play(key, { volume: 0.72 });
  }

  private updateMusic(force = false): void {
    let key = '';
    if (this.view === 'room') key = ['fire-dead', 'fire-smoldering', 'fire-flickering', 'fire-burning', 'fire-roaring'][this.state.fire];
    if (this.view === 'village') {
      const huts = this.state.buildings.hut;
      key = huts === 0 ? 'silent-forest' : huts === 1 ? 'lonely-hut' : huts <= 4 ? 'tiny-village' : huts <= 8 ? 'modest-village' : huts <= 14 ? 'large-village' : 'raucous-village';
    }
    if (this.view === 'world') key = this.state.world.active ? 'world' : 'dusty-path';
    if (this.view === 'ship') key = 'ship';
    if (this.view === 'space') key = 'space';
    if (this.view === 'ending') key = 'ending';
    if (!key || (!force && key === this.currentMusicKey)) return;
    this.currentMusic?.stop();
    this.currentMusic?.destroy();
    this.currentMusic = this.sound.add(key, { loop: true, volume: 0.32 });
    this.currentMusicKey = key;
    this.currentMusic.play();
  }

  private persist(show = true): void {
    saveState(this.state);
    if (show) {
      this.saveText.setText('已保存');
      this.time.delayedCall(900, () => this.saveText.setText(''));
    }
  }

  private confirmRestart(): void {
    const modal = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82).setInteractive();
    const box = panel(this, W / 2, H / 2, 850, 390, 0x17191c);
    const title = label(this, W / 2, H / 2 - 100, '让一切重新归于黑暗？', 34).setOrigin(0.5);
    const yes = button(this, 380, H / 2 + 80, 280, 82, '重新开始', () => {
      clearState();
      this.state = freshState();
      modal.destroy(true);
      this.showView('room');
    });
    const no = button(this, 700, H / 2 + 80, 280, 82, '取消', () => modal.destroy(true));
    yes.text.setColor(COLORS.danger);
    modal.add([shade, box, title, yes.root, no.root]);
  }
}
