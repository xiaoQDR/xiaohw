import Phaser from 'phaser';

const DESIGN_W = 1080;
const DESIGN_H = 1920;
const TILE_W = 132;
const TILE_H = 66;
const GRID_COLS = 9;
const GRID_ROWS = 11;
const GRID_ORIGIN_X = DESIGN_W / 2;
const GRID_ORIGIN_Y = 360;
const MENU_H = 280;

type BuildingId = 'hut' | 'lumberyard' | 'workshop' | 'storehouse';

interface BuildingDef {
  id: BuildingId;
  name: string;
  texture: string;
  footprint: [number, number];
  cost: string;
}

interface PlacedBuilding {
  id: BuildingId;
  col: number;
  row: number;
  sprite: Phaser.GameObjects.Image;
}

const BUILDINGS: BuildingDef[] = [
  { id: 'hut', name: '小屋', texture: 'building-hut', footprint: [1, 1], cost: '木材 10' },
  { id: 'lumberyard', name: '伐木场', texture: 'building-lumberyard', footprint: [2, 1], cost: '木材 20' },
  { id: 'workshop', name: '工坊', texture: 'building-workshop', footprint: [2, 2], cost: '木材 30' },
  { id: 'storehouse', name: '仓库', texture: 'building-storehouse', footprint: [2, 2], cost: '木材 40' },
];

export class BuildScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private topBar!: Phaser.GameObjects.Container;
  private menu!: Phaser.GameObjects.Container;
  private placed: PlacedBuilding[] = [];
  private occupied = new Set<string>();
  private dragDef: BuildingDef | null = null;
  private dragPreview: Phaser.GameObjects.Image | null = null;
  private hoverTile: Phaser.GameObjects.Graphics | null = null;
  private cameraDragStart: Phaser.Math.Vector2 | null = null;
  private cameraScrollStart: Phaser.Math.Vector2 | null = null;

  constructor() {
    super('build');
  }

  preload(): void {
    this.load.svg('building-hut', 'assets/buildings/hut.svg', { width: 210, height: 210 });
    this.load.svg('building-lumberyard', 'assets/buildings/lumberyard.svg', { width: 280, height: 230 });
    this.load.svg('building-workshop', 'assets/buildings/workshop.svg', { width: 300, height: 260 });
    this.load.svg('building-storehouse', 'assets/buildings/storehouse.svg', { width: 310, height: 260 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#a9c783');
    this.world = this.add.container(0, 0);
    this.drawGround();
    this.drawGrid();
    this.createTopBar();
    this.createBottomMenu();
    this.createDragHandlers();
    this.createCameraHandlers();
    this.seedScene();
    this.resizeViewport(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    });
  }

  update(): void {
    this.updateUiAnchors();
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
    g.fillRect(-900, -300, DESIGN_W + 1800, DESIGN_H + 1200);
    for (let i = 0; i < 30; i += 1) {
      const x = Phaser.Math.Between(-300, DESIGN_W + 300);
      const y = Phaser.Math.Between(220, DESIGN_H - MENU_H - 40);
      g.fillStyle(i % 2 === 0 ? 0x93b46f : 0xa8c986, 0.55);
      g.fillCircle(x, y, Phaser.Math.Between(8, 22));
    }
    this.world.add(g);
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(2, 0x6f8f58, 0.36);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const p = this.gridToWorld(col, row);
        this.strokeDiamond(g, p.x, p.y, TILE_W, TILE_H);
      }
    }
    this.world.add(g);
  }

  private createTopBar(): void {
    this.topBar = this.add.container(0, 0).setDepth(5000);
    const bg = this.add.rectangle(DESIGN_W / 2, 74, DESIGN_W, 148, 0x263126, 0.96);
    const title = this.add.text(42, 42, '小黑屋 · 营地', {
      fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#f4f0df', fontStyle: 'bold',
    });
    const resource = this.add.text(DESIGN_W - 42, 52, '木材 120   人口 3', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#efe6c8',
    }).setOrigin(1, 0);
    this.topBar.add([bg, title, resource]);
  }

  private createBottomMenu(): void {
    this.menu = this.add.container(0, 0).setDepth(5000);
    const bg = this.add.rectangle(DESIGN_W / 2, MENU_H / 2, DESIGN_W, MENU_H, 0x202821, 0.98)
      .setInteractive();
    const topLine = this.add.rectangle(DESIGN_W / 2, 3, DESIGN_W, 6, 0x627653, 1);
    const title = this.add.text(34, 20, '建造', {
      fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#f2ebd8', fontStyle: 'bold',
    });
    this.menu.add([bg, topLine, title]);

    const cardW = 235;
    const gap = 18;
    BUILDINGS.forEach((def, index) => {
      const x = 34 + index * (cardW + gap);
      const card = this.add.rectangle(x + cardW / 2, 150, cardW, 178, 0x354237, 1)
        .setStrokeStyle(2, 0x718669, 1)
        .setInteractive({ draggable: true, useHandCursor: true });
      card.setData('buildingDef', def);
      const icon = this.add.image(x + 54, 132, def.texture).setDisplaySize(94, 94);
      const name = this.add.text(x + 108, 95, def.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff7df', fontStyle: 'bold',
      });
      const cost = this.add.text(x + 108, 132, def.cost, {
        fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#c8d4ba',
      });
      const hint = this.add.text(x + 108, 164, '拖入场景', {
        fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#91aa82',
      });
      this.menu.add([card, icon, name, cost, hint]);
    });
  }

  private createDragHandlers(): void {
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const def = gameObject.getData('buildingDef') as BuildingDef | undefined;
      if (!def) return;
      this.dragDef = def;
      this.dragPreview?.destroy();
      this.dragPreview = this.add.image(0, 0, def.texture).setAlpha(0.66).setDepth(4000);
      this.hoverTile?.destroy();
      this.hoverTile = this.add.graphics().setDepth(3990);
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!gameObject.getData('buildingDef') || !this.dragDef || !this.dragPreview) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const cell = this.worldToGrid(worldPoint.x, worldPoint.y);
      const valid = this.canPlace(this.dragDef, cell.col, cell.row) && !this.isPointerInMenu(pointer);
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
          this.placeBuilding(def, cell.col, cell.row, true);
        }
      }
      this.dragPreview?.destroy();
      this.hoverTile?.destroy();
      this.dragPreview = null;
      this.hoverTile = null;
      this.dragDef = null;
    });
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

  private seedScene(): void {
    this.placeBuilding(BUILDINGS[0], 4, 5, false);
    this.placeBuilding(BUILDINGS[1], 1, 6, false);
  }

  private placeBuilding(def: BuildingDef, col: number, row: number, animate: boolean): void {
    const p = this.gridToWorld(col, row);
    const sprite = this.add.image(p.x, p.y - 58, def.texture).setDepth(300 + col + row * 10);
    if (def.id === 'hut') sprite.setDisplaySize(210, 210);
    if (def.id === 'lumberyard') sprite.setDisplaySize(280, 230);
    if (def.id === 'workshop') sprite.setDisplaySize(300, 260);
    if (def.id === 'storehouse') sprite.setDisplaySize(310, 260);
    this.world.add(sprite);
    this.placed.push({ id: def.id, col, row, sprite });
    for (let y = 0; y < def.footprint[1]; y += 1) {
      for (let x = 0; x < def.footprint[0]; x += 1) this.occupied.add(`${col + x},${row + y}`);
    }
    if (animate) {
      sprite.setScale(sprite.scaleX * 0.78, sprite.scaleY * 0.78);
      this.tweens.add({ targets: sprite, scaleX: sprite.scaleX / 0.78, scaleY: sprite.scaleY / 0.78, duration: 180, ease: 'Back.Out' });
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
