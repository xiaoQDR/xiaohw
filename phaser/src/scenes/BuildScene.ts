import Phaser from 'phaser';

const DESIGN_W = 1080;
const DESIGN_H = 1920;
const TILE_W = 132;
const TILE_H = 66;
const GRID_COLS = 9;
const GRID_ROWS = 11;
const GRID_ORIGIN_X = DESIGN_W / 2;
const GRID_ORIGIN_Y = 350;
const MENU_H = 430;
const TREE_CD_MS = 5000;
const POPULATION_ARRIVAL_MS = 8000;
const WORKER_WOOD_YIELD = 1;

type BuildingId = 'trap' | 'cart' | 'hut' | 'lodge' | 'tradingPost' | 'tannery' | 'smokehouse' | 'workshop' | 'steelworks' | 'armoury';

interface BuildingDef {
  id: BuildingId;
  name: string;
  texture: string;
  footprint: [number, number];
  costWood: number;
  displaySize: [number, number];
}

interface PlacedBuilding {
  id: BuildingId;
  col: number;
  row: number;
  sprite: Phaser.GameObjects.Image;
}

const BUILDINGS: BuildingDef[] = [
  { id: 'trap', name: '陷阱', texture: 'building-trap', footprint: [1, 1], costWood: 10, displaySize: [180, 180] },
  { id: 'cart', name: '手推车', texture: 'building-cart', footprint: [1, 1], costWood: 30, displaySize: [190, 190] },
  { id: 'hut', name: '小屋', texture: 'building-hut', footprint: [1, 1], costWood: 100, displaySize: [210, 210] },
  { id: 'lodge', name: '猎人小屋', texture: 'building-lodge', footprint: [2, 1], costWood: 200, displaySize: [250, 230] },
  { id: 'tradingPost', name: '交易站', texture: 'building-trading-post', footprint: [2, 2], costWood: 400, displaySize: [280, 250] },
  { id: 'tannery', name: '制革屋', texture: 'building-tannery', footprint: [2, 2], costWood: 500, displaySize: [275, 250] },
  { id: 'smokehouse', name: '熏肉房', texture: 'building-smokehouse', footprint: [2, 2], costWood: 600, displaySize: [275, 250] },
  { id: 'workshop', name: '工坊', texture: 'building-workshop', footprint: [2, 2], costWood: 800, displaySize: [300, 260] },
  { id: 'steelworks', name: '炼钢坊', texture: 'building-steelworks', footprint: [2, 2], costWood: 1500, displaySize: [300, 265] },
  { id: 'armoury', name: '军械库', texture: 'building-armoury', footprint: [2, 2], costWood: 3000, displaySize: [300, 265] },
];

export class BuildScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private topBar!: Phaser.GameObjects.Container;
  private menu!: Phaser.GameObjects.Container;
  private resourceText!: Phaser.GameObjects.Text;
  private placed: PlacedBuilding[] = [];
  private occupied = new Set<string>();
  private dragDef: BuildingDef | null = null;
  private dragPreview: Phaser.GameObjects.Image | null = null;
  private hoverTile: Phaser.GameObjects.Graphics | null = null;
  private cameraDragStart: Phaser.Math.Vector2 | null = null;
  private cameraScrollStart: Phaser.Math.Vector2 | null = null;
  private wood = 0;
  private population = 0;
  private populationCap = 0;
  private nextPopulationAt = Number.POSITIVE_INFINITY;
  private treeReadyAt = 0;
  private treeSprite!: Phaser.GameObjects.Image;
  private treeStatus!: Phaser.GameObjects.Text;
  private treeBadge!: Phaser.GameObjects.Container;
  private forestTrees: Phaser.GameObjects.Image[] = [];
  private workers: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('build');
  }

  preload(): void {
    this.load.svg('building-trap', 'assets/buildings/trap.svg', { width: 220, height: 220 });
    this.load.svg('building-cart', 'assets/buildings/cart.svg', { width: 220, height: 220 });
    this.load.svg('building-hut', 'assets/buildings/hut.svg', { width: 240, height: 240 });
    this.load.svg('building-lodge', 'assets/buildings/lodge.svg', { width: 260, height: 250 });
    this.load.svg('building-trading-post', 'assets/buildings/trading-post.svg', { width: 280, height: 260 });
    this.load.svg('building-tannery', 'assets/buildings/tannery.svg', { width: 280, height: 260 });
    this.load.svg('building-smokehouse', 'assets/buildings/smokehouse.svg', { width: 280, height: 260 });
    this.load.svg('building-workshop', 'assets/buildings/workshop.svg', { width: 300, height: 260 });
    this.load.svg('building-steelworks', 'assets/buildings/steelworks.svg', { width: 300, height: 270 });
    this.load.svg('building-armoury', 'assets/buildings/armoury.svg', { width: 300, height: 270 });
    this.load.svg('harvest-tree', 'assets/tree.svg', { width: 420, height: 380 });
    this.load.svg('forest-tree', 'assets/forest-tree.svg', { width: 180, height: 220 });
    this.load.svg('worker', 'assets/worker.svg', { width: 96, height: 140 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#a9c783');
    this.world = this.add.container(0, 0);
    this.drawGround();
    this.createPerimeterForest();
    this.drawGrid();
    this.createHarvestTree();
    this.createTopBar();
    this.createBottomMenu();
    this.createDragHandlers();
    this.createCameraHandlers();
    this.resizeViewport(this.scale.gameSize);
    this.refreshResources();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    });
  }

  update(): void {
    this.updateUiAnchors();
    this.updateTreeStatus();
    this.updatePopulation();
  }

  private resizeViewport(gameSize: Phaser.Structs.Size): void {
    const zoom = Math.min(gameSize.width / DESIGN_W, gameSize.height / DESIGN_H);
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height).setZoom(zoom);
    this.cameras.main.centerOn(DESIGN_W / 2, DESIGN_H / 2);
    this.updateUiAnchors();
  }

  private updateUiAnchors(): void {
    if (!this.topBar || !this.menu) return;
    const view = this.cameras.main.worldView;
    this.topBar.setPosition(view.centerX - DESIGN_W / 2, view.top).setDepth(5000);
    this.menu.setPosition(view.centerX - DESIGN_W / 2, view.bottom - MENU_H).setDepth(5000);
  }

  private drawGround(): void {
    const g = this.add.graphics();
    g.fillStyle(0x9fbe79, 1);
    g.fillRect(-1000, -500, DESIGN_W + 2000, DESIGN_H + 1500);
    for (let i = 0; i < 42; i += 1) {
      const x = Phaser.Math.Between(-400, DESIGN_W + 400);
      const y = Phaser.Math.Between(180, DESIGN_H - MENU_H - 20);
      g.fillStyle(i % 2 === 0 ? 0x93b46f : 0xa8c986, 0.5);
      g.fillCircle(x, y, Phaser.Math.Between(8, 22));
    }
    this.world.add(g);
  }

  private createPerimeterForest(): void {
    const points: Phaser.Math.Vector2[] = [];
    const addTree = (col: number, row: number, ox = 0, oy = 0) => {
      const p = this.gridToWorld(col, row);
      points.push(new Phaser.Math.Vector2(p.x + ox, p.y + oy));
    };

    for (let i = -2; i <= GRID_COLS + 1; i += 2) {
      addTree(i, -3, Phaser.Math.Between(-18, 18), Phaser.Math.Between(-18, 18));
      addTree(i, GRID_ROWS + 2, Phaser.Math.Between(-18, 18), Phaser.Math.Between(-18, 18));
    }
    for (let i = -1; i <= GRID_ROWS; i += 2) {
      addTree(-4, i, Phaser.Math.Between(-18, 18), Phaser.Math.Between(-18, 18));
      addTree(GRID_COLS + 3, i, Phaser.Math.Between(-18, 18), Phaser.Math.Between(-18, 18));
    }

    points.forEach((p, index) => {
      const tree = this.add.image(p.x, p.y - 76, 'forest-tree')
        .setDisplaySize(150 + (index % 3) * 10, 184 + (index % 3) * 12)
        .setDepth(90 + Math.round(p.y / 20));
      this.world.add(tree);
      this.forestTrees.push(tree);
    });
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(2, 0x6f8f58, 0.34);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const p = this.gridToWorld(col, row);
        this.strokeDiamond(g, p.x, p.y, TILE_W, TILE_H);
      }
    }
    this.world.add(g);
  }

  private createHarvestTree(): void {
    const treeCol = 4;
    const treeRow = 3;
    const p = this.gridToWorld(treeCol, treeRow);
    this.treeSprite = this.add.image(p.x, p.y - 122, 'harvest-tree')
      .setDisplaySize(420, 380)
      .setDepth(315)
      .setInteractive({ useHandCursor: true });
    this.world.add(this.treeSprite);
    ['4,3', '3,3', '4,2', '3,2'].forEach((key) => this.occupied.add(key));

    const badgeBg = this.add.rectangle(p.x + 8, p.y - 338, 250, 58, 0x253226, 0.9)
      .setStrokeStyle(2, 0x78906a, 1);
    this.treeStatus = this.add.text(p.x + 8, p.y - 338, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#f5edd9', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.treeBadge = this.add.container(0, 0, [badgeBg, this.treeStatus]).setDepth(430);
    this.world.add(this.treeBadge);

    this.treeReadyAt = this.time.now + TREE_CD_MS;
    this.treeSprite.on('pointerdown', () => this.collectTreeWood());
  }

  private updateTreeStatus(): void {
    if (!this.treeStatus) return;
    const remaining = Math.max(0, this.treeReadyAt - this.time.now);
    if (remaining <= 0) {
      this.treeStatus.setText(`手动采集 +${this.getWoodYield()}`).setColor('#f5e7a6');
      this.treeSprite.clearTint();
      return;
    }
    this.treeStatus.setText(`火堆旁采集 ${Math.ceil(remaining / 1000)}s`).setColor('#d4ddca');
    this.treeSprite.setTint(0xe4eddc);
  }

  private collectTreeWood(): void {
    if (this.time.now < this.treeReadyAt) return;
    const amount = this.getWoodYield();
    this.wood += amount;
    this.treeReadyAt = this.time.now + TREE_CD_MS;
    this.refreshResources();
    this.tweens.add({ targets: this.treeSprite, scaleX: 1.03, scaleY: 1.03, yoyo: true, duration: 110, ease: 'Sine.Out' });
    this.showWoodPopup(this.treeSprite.x + 86, this.treeSprite.y + 70, amount);
  }

  private getWoodYield(): number {
    return this.placed.some((b) => b.id === 'cart') ? 50 : 10;
  }

  private updatePopulation(): void {
    if (this.population >= this.populationCap) {
      this.nextPopulationAt = Number.POSITIVE_INFINITY;
      return;
    }
    if (!Number.isFinite(this.nextPopulationAt)) {
      this.nextPopulationAt = this.time.now + POPULATION_ARRIVAL_MS;
      return;
    }
    if (this.time.now < this.nextPopulationAt) return;
    this.population += 1;
    this.nextPopulationAt = this.population < this.populationCap ? this.time.now + POPULATION_ARRIVAL_MS : Number.POSITIVE_INFINITY;
    this.spawnWorker();
    this.refreshResources();
    this.showToast('有一个流浪者加入了营地');
  }

  private recalculatePopulationCap(): void {
    const hutCount = this.placed.filter((b) => b.id === 'hut').length;
    this.populationCap = hutCount * 4;
    if (this.population < this.populationCap && !Number.isFinite(this.nextPopulationAt)) {
      this.nextPopulationAt = this.time.now + POPULATION_ARRIVAL_MS;
    }
    this.refreshResources();
  }

  private spawnWorker(): void {
    const camp = this.gridToWorld(4, 3);
    const worker = this.add.image(camp.x + Phaser.Math.Between(-55, 55), camp.y + 40, 'worker')
      .setDisplaySize(54, 79)
      .setDepth(700);
    this.world.add(worker);
    this.workers.push(worker);
    this.startWorkerLoop(worker, Phaser.Math.Between(300, 1200));
  }

  private startWorkerLoop(worker: Phaser.GameObjects.Image, delay = 0): void {
    this.time.delayedCall(delay, () => {
      if (!worker.active || this.forestTrees.length === 0) return;
      const target = Phaser.Utils.Array.GetRandom(this.forestTrees);
      const targetX = target.x + Phaser.Math.Between(-24, 24);
      const targetY = target.y + 70;
      worker.setDepth(700 + Math.round(worker.y / 20));
      this.tweens.add({
        targets: worker,
        x: targetX,
        y: targetY,
        duration: Phaser.Math.Between(1700, 2300),
        ease: 'Sine.InOut',
        onComplete: () => {
          if (!worker.active) return;
          this.tweens.add({ targets: worker, angle: -6, yoyo: true, repeat: 3, duration: 130 });
          this.time.delayedCall(850, () => this.returnWorkerToCamp(worker));
        },
      });
    });
  }

  private returnWorkerToCamp(worker: Phaser.GameObjects.Image): void {
    if (!worker.active) return;
    const camp = this.gridToWorld(4, 3);
    const deliverX = camp.x + Phaser.Math.Between(55, 105);
    const deliverY = camp.y + Phaser.Math.Between(20, 55);
    this.tweens.add({
      targets: worker,
      x: deliverX,
      y: deliverY,
      angle: 0,
      duration: Phaser.Math.Between(1500, 2100),
      ease: 'Sine.InOut',
      onComplete: () => {
        if (!worker.active) return;
        this.wood += WORKER_WOOD_YIELD;
        this.refreshResources();
        this.showWoodPopup(deliverX, deliverY - 55, WORKER_WOOD_YIELD);
        this.startWorkerLoop(worker, Phaser.Math.Between(500, 1100));
      },
    });
  }

  private showWoodPopup(x: number, y: number, amount: number): void {
    const popup = this.add.text(x, y, `+${amount} 木材`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff1a8', fontStyle: 'bold',
      stroke: '#30412d', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(4500);
    this.world.add(popup);
    this.tweens.add({ targets: popup, y: popup.y - 45, alpha: 0, duration: 720, onComplete: () => popup.destroy() });
  }

  private createTopBar(): void {
    this.topBar = this.add.container(0, 0).setDepth(5000);
    const bg = this.add.rectangle(DESIGN_W / 2, 74, DESIGN_W, 148, 0x263126, 0.96);
    const title = this.add.text(42, 42, '小黑屋 · 营地', {
      fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#f4f0df', fontStyle: 'bold',
    });
    this.resourceText = this.add.text(DESIGN_W - 42, 52, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#efe6c8',
    }).setOrigin(1, 0);
    this.topBar.add([bg, title, this.resourceText]);
  }

  private refreshResources(): void {
    if (this.resourceText) this.resourceText.setText(`木材 ${this.wood}   人口 ${this.population}/${this.populationCap}`);
  }

  private createBottomMenu(): void {
    this.menu = this.add.container(0, 0).setDepth(5000);
    const bg = this.add.rectangle(DESIGN_W / 2, MENU_H / 2, DESIGN_W, MENU_H, 0x202821, 0.985).setInteractive();
    const topLine = this.add.rectangle(DESIGN_W / 2, 3, DESIGN_W, 6, 0x627653, 1);
    const title = this.add.text(28, 16, '建造 · 拖入场景', {
      fontFamily: 'system-ui, sans-serif', fontSize: '27px', color: '#f2ebd8', fontStyle: 'bold',
    });
    this.menu.add([bg, topLine, title]);

    const cols = 5;
    const cardW = 196;
    const cardH = 156;
    const gapX = 12;
    const gapY = 12;
    const startX = 26;
    const startY = 74;

    BUILDINGS.forEach((def, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const card = this.add.rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x354237, 1)
        .setStrokeStyle(2, 0x718669, 1)
        .setInteractive({ draggable: true, useHandCursor: true });
      card.setData('buildingDef', def);
      const icon = this.add.image(x + 48, y + 68, def.texture).setDisplaySize(82, 82);
      const name = this.add.text(x + 92, y + 26, def.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff7df', fontStyle: 'bold',
      });
      const cost = this.add.text(x + 92, y + 61, `木材 ${def.costWood}`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#c8d4ba',
      });
      const footprint = this.add.text(x + 92, y + 90, `${def.footprint[0]}×${def.footprint[1]}`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#91aa82',
      });
      this.menu.add([card, icon, name, cost, footprint]);
    });
  }

  private createDragHandlers(): void {
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const def = gameObject.getData('buildingDef') as BuildingDef | undefined;
      if (!def) return;
      this.dragDef = def;
      this.dragPreview?.destroy();
      this.dragPreview = this.add.image(0, 0, def.texture)
        .setDisplaySize(def.displaySize[0], def.displaySize[1])
        .setAlpha(0.7)
        .setDepth(4000);
      this.hoverTile?.destroy();
      this.hoverTile = this.add.graphics().setDepth(3990);
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!gameObject.getData('buildingDef') || !this.dragDef || !this.dragPreview) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const cell = this.worldToGrid(worldPoint.x, worldPoint.y);
      const valid = this.canPlace(this.dragDef, cell.col, cell.row) && !this.isPointerInMenu(pointer) && this.wood >= this.dragDef.costWood;
      const p = this.gridToWorld(cell.col, cell.row);
      this.dragPreview.setPosition(p.x, p.y - 58).setTint(valid ? 0xffffff : 0xe56b5d);
      this.drawHoverFootprint(this.dragDef, cell.col, cell.row, valid);
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const def = gameObject.getData('buildingDef') as BuildingDef | undefined;
      if (def) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const cell = this.worldToGrid(worldPoint.x, worldPoint.y);
        if (!this.isPointerInMenu(pointer) && this.canPlace(def, cell.col, cell.row)) {
          if (this.wood >= def.costWood) {
            this.wood -= def.costWood;
            this.placeBuilding(def, cell.col, cell.row, true);
            this.refreshResources();
          } else {
            this.showToast(`木材不足，需要 ${def.costWood}`);
          }
        }
      }
      this.dragPreview?.destroy();
      this.hoverTile?.destroy();
      this.dragPreview = null;
      this.hoverTile = null;
      this.dragDef = null;
    });
  }

  private showToast(message: string): void {
    const view = this.cameras.main.worldView;
    const text = this.add.text(view.centerX, view.top + 190, message, {
      fontFamily: 'system-ui, sans-serif', fontSize: '27px', color: '#fff4dc', backgroundColor: '#4b382c',
      padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setDepth(6000);
    this.tweens.add({ targets: text, alpha: 0, y: text.y - 25, delay: 700, duration: 350, onComplete: () => text.destroy() });
  }

  private isPointerInMenu(pointer: Phaser.Input.Pointer): boolean {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return worldPoint.y >= this.cameras.main.worldView.bottom - MENU_H;
  }

  private createCameraHandlers(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.dragDef || this.isPointerInMenu(pointer)) return;
      this.cameraDragStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.cameraScrollStart = new Phaser.Math.Vector2(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.cameraDragStart || !this.cameraScrollStart || this.dragDef) return;
      const z = this.cameras.main.zoom;
      this.cameras.main.scrollX = this.cameraScrollStart.x - (pointer.x - this.cameraDragStart.x) / z;
      this.cameras.main.scrollY = this.cameraScrollStart.y - (pointer.y - this.cameraDragStart.y) / z;
      this.updateUiAnchors();
    });
    this.input.on('pointerup', () => {
      this.cameraDragStart = null;
      this.cameraScrollStart = null;
    });
  }

  private placeBuilding(def: BuildingDef, col: number, row: number, animate: boolean): void {
    const p = this.gridToWorld(col, row);
    const sprite = this.add.image(p.x, p.y - 58, def.texture)
      .setDisplaySize(def.displaySize[0], def.displaySize[1])
      .setDepth(300 + col + row * 10);
    this.world.add(sprite);
    this.placed.push({ id: def.id, col, row, sprite });
    for (let y = 0; y < def.footprint[1]; y += 1) {
      for (let x = 0; x < def.footprint[0]; x += 1) this.occupied.add(`${col + x},${row + y}`);
    }
    if (def.id === 'hut') this.recalculatePopulationCap();
    if (animate) {
      const sx = sprite.scaleX;
      const sy = sprite.scaleY;
      sprite.setScale(sx * 0.78, sy * 0.78);
      this.tweens.add({ targets: sprite, scaleX: sx, scaleY: sy, duration: 180, ease: 'Back.Out' });
    }
  }

  private canPlace(def: BuildingDef, col: number, row: number): boolean {
    if (col < 0 || row < 0 || col + def.footprint[0] > GRID_COLS || row + def.footprint[1] > GRID_ROWS) return false;
    for (let y = 0; y < def.footprint[1]; y += 1) {
      for (let x = 0; x < def.footprint[0]; x += 1) {
        if (this.occupied.has(`${col + x},${row + y}`)) return false;
      }
    }
    return true;
  }

  private drawHoverFootprint(def: BuildingDef, col: number, row: number, valid: boolean): void {
    if (!this.hoverTile) return;
    this.hoverTile.clear();
    this.hoverTile.fillStyle(valid ? 0x8fcf68 : 0xdf665b, 0.34);
    this.hoverTile.lineStyle(3, valid ? 0x4f9134 : 0xb9433a, 0.9);
    for (let y = 0; y < def.footprint[1]; y += 1) {
      for (let x = 0; x < def.footprint[0]; x += 1) {
        const p = this.gridToWorld(col + x, row + y);
        this.fillDiamond(this.hoverTile, p.x, p.y, TILE_W, TILE_H);
        this.strokeDiamond(this.hoverTile, p.x, p.y, TILE_W, TILE_H);
      }
    }
  }

  private gridToWorld(col: number, row: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      GRID_ORIGIN_X + (col - row) * (TILE_W / 2),
      GRID_ORIGIN_Y + (col + row) * (TILE_H / 2),
    );
  }

  private worldToGrid(x: number, y: number): { col: number; row: number } {
    const dx = x - GRID_ORIGIN_X;
    const dy = y - GRID_ORIGIN_Y;
    const col = Math.round(dx / TILE_W + dy / TILE_H);
    const row = Math.round(dy / TILE_H - dx / TILE_W);
    return { col, row };
  }

  private strokeDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.strokePoints([
      new Phaser.Math.Vector2(x, y - h / 2),
      new Phaser.Math.Vector2(x + w / 2, y),
      new Phaser.Math.Vector2(x, y + h / 2),
      new Phaser.Math.Vector2(x - w / 2, y),
    ], true);
  }

  private fillDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillPoints([
      new Phaser.Math.Vector2(x, y - h / 2),
      new Phaser.Math.Vector2(x + w / 2, y),
      new Phaser.Math.Vector2(x, y + h / 2),
      new Phaser.Math.Vector2(x - w / 2, y),
    ], true);
  }
}
