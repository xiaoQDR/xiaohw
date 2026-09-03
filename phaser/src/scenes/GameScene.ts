import Phaser from 'phaser';
import { BUILDINGS, CRAFTS, FIRE_NAMES, JOB_NAMES, JOB_PRODUCTION, RESOURCE_NAMES, TRADES } from '../game/data';
import { clearState, freshState, loadState, saveState } from '../game/state';
import type { BuildDefinition, Cost, CraftDefinition, Job, Resource, SaveState, TradeDefinition, ViewName } from '../game/types';
import { getLandmark, getWorldTile, WORLD_RADIUS } from '../game/worldMap';
import { button, COLORS, formatAmount, label, panel, type ButtonParts } from '../ui/components';

const W = 1080;
const H = 1920;

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
  private activeEnemy: { name: string; hp: number; maxHp: number; damage: number; nextAttack: number; loot: Partial<Record<Resource, number>>; landmarkKey?: string } | null = null;
  private attackReadyAt = 0;

  constructor() {
    super('game');
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
    this.showView(this.state.world.active ? 'world' : 'room');

    this.time.addEvent({ delay: 1000, loop: true, callback: this.tick, callbackScope: this });
    this.time.addEvent({ delay: 10000, loop: true, callback: () => this.persist(false) });
    this.input.keyboard?.on('keydown-ONE', () => this.showView('room'));
    this.input.keyboard?.on('keydown-TWO', () => this.state.builderArrived && this.showView('village'));
    this.input.keyboard?.on('keydown-THREE', () => this.state.worldUnlocked && this.showView('world'));
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
    const items: Array<{ id: ViewName; name: string; unlocked: boolean }> = [
      { id: 'room', name: '房间', unlocked: true },
      { id: 'village', name: '村庄', unlocked: this.state.builderArrived },
      { id: 'world', name: '荒野', unlocked: this.state.worldUnlocked },
    ];
    items.forEach((item, index) => {
      const x = 180 + index * 360;
      const active = this.view === item.id;
      const bg = this.add.rectangle(x, 55, 300, 88, active ? 0x24272b : 0x15171a)
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
    this.view = view;
    this.page = 0;
    this.subPage = 0;
    this.root.removeAll(true);
    this.drawNav();
    if (view === 'room') this.drawRoom();
    if (view === 'village') this.drawVillage();
    if (view === 'world') this.drawWorld();
    this.refreshHeader();
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
    this.addLog(this.state.fire === 4 ? '火焰咆哮起来。' : '火焰吞下木头，亮了一些。');
    this.showView('room');
  }

  private gatherWood(): void {
    if (this.state.gatherCooldown > 0) return;
    const amount = this.state.buildings.cart ? 50 : 10;
    this.state.stores.wood += amount;
    this.state.gatherCooldown = 60;
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
      this.startCombat(landmark.name, landmark.danger, this.getLandmarkLoot(landmark.tile), key);
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
    this.activeEnemy = { name, hp, maxHp: hp, damage: Math.max(1, Math.floor(hp / 7)), nextAttack: Date.now() + 1600, loot, landmarkKey };
    this.attackReadyAt = 0;
    this.showView('world');
  }

  private drawCombat(): void {
    const enemy = this.activeEnemy;
    if (!enemy) return;
    const w = this.state.world;
    this.root.add(label(this, 54, 35, '遭遇', 42, COLORS.danger).setFontStyle('bold'));
    const p = panel(this, W / 2, 450, 972, 630, 0x151315);
    this.root.add(p);
    this.root.add(label(this, W / 2, 250, enemy.name, 38).setOrigin(0.5));
    this.root.add(label(this, W / 2, 330, `敌人  ${enemy.hp}/${enemy.maxHp}`, 27, COLORS.danger).setOrigin(0.5));
    this.root.add(label(this, W / 2, 385, `旅人  ${w.hp}/${w.maxHp}`, 27, COLORS.good).setOrigin(0.5));
    const attack = button(this, W / 2, 550, 480, 96, '攻击', () => this.attack());
    attack.setEnabled(Date.now() >= this.attackReadyAt);
    this.root.add(attack.root);
    this.root.add(label(this, W / 2, 650, this.getWeaponDescription(), 22, COLORS.dim).setOrigin(0.5));
    const flee = button(this, W / 2, 810, 360, 72, '逃跑（失去 3 生命）', () => {
      w.hp -= 3;
      this.activeEnemy = null;
      if (w.hp <= 0) this.collapse(); else this.showView('world');
    });
    this.root.add(flee.root);
  }

  private attack(): void {
    const enemy = this.activeEnemy;
    if (!enemy || Date.now() < this.attackReadyAt) return;
    const weapon = this.getWeapon();
    if (weapon.ammo && this.state.stores[weapon.ammo] <= 0) return;
    if (weapon.ammo) this.state.stores[weapon.ammo] -= 1;
    const damage = Math.random() <= 0.8 ? weapon.damage : 0;
    enemy.hp -= damage;
    this.attackReadyAt = Date.now() + weapon.cooldown * 1000;
    if (enemy.hp <= 0) {
      Object.entries(enemy.loot).forEach(([key, value]) => { this.state.stores[key as Resource] += value ?? 0; });
      if (enemy.landmarkKey && !this.state.world.cleared.includes(enemy.landmarkKey)) this.state.world.cleared.push(enemy.landmarkKey);
      this.addLog(`从${enemy.name}带回了有用的物资。`);
      this.activeEnemy = null;
      this.showView('world');
      return;
    }
    this.showView('world');
  }

  private getWeapon(): { name: string; damage: number; cooldown: number; ammo?: Resource } {
    if (this.state.crafted.rifle && this.state.stores.bullets > 0) return { name: '步枪', damage: 5, cooldown: 1, ammo: 'bullets' };
    if (this.state.crafted.steelSword) return { name: '钢剑', damage: 6, cooldown: 2 };
    if (this.state.crafted.ironSword) return { name: '铁剑', damage: 4, cooldown: 2 };
    if (this.state.crafted.boneSpear) return { name: '骨矛', damage: 2, cooldown: 2 };
    return { name: '拳头', damage: 1, cooldown: 2 };
  }

  private getWeaponDescription(): string {
    const weapon = this.getWeapon();
    return `${weapon.name} · 伤害 ${weapon.damage} · 命中率 80%${weapon.ammo ? ` · ${RESOURCE_NAMES[weapon.ammo]} ${this.state.stores[weapon.ammo]}` : ''}`;
  }

  private collapse(): void {
    const w = this.state.world;
    w.active = false; w.x = 0; w.y = 0; w.hp = w.maxHp; w.food = 0; w.water = 0;
    this.activeEnemy = null;
    this.addLog('旅人在荒野中倒下，醒来时已回到火堆旁。');
    this.showView('room');
  }

  private returnHome(): void {
    const w = this.state.world;
    w.active = false; w.x = 0; w.y = 0;
    this.addLog('旅人回到了村庄。');
    this.persist(false);
    this.showView('village');
  }

  private tick(): void {
    const s = this.state;
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
    this.state.world.hp -= enemy.damage;
    enemy.nextAttack = Date.now() + 1600;
    if (this.state.world.hp <= 0) this.collapse();
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
