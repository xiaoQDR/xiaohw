import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';
import { RESOURCE_NAMES, TRADES } from '../game/data';

type AnyFn = (...args: any[]) => any;
type Trade = (typeof TRADES)[number];
type CostItem = Trade['cost'][number];
type PrivateScene = Record<string, unknown>;

type TradeCard = {
  trade: Trade;
  costText: Phaser.GameObjects.Text;
  ownText: Phaser.GameObjects.Text;
  buyBg: Phaser.GameObjects.Rectangle;
  buyText: Phaser.GameObjects.Text;
};

type TradingState = {
  panel?: Phaser.GameObjects.Container;
  open: boolean;
  cards: TradeCard[];
  boundSprites: WeakSet<Phaser.GameObjects.Image>;
  resourceSummary?: Phaser.GameObjects.Text;
};

const states = new WeakMap<BuildScene, TradingState>();

function scenePrivate(scene: BuildScene): PrivateScene {
  return scene as unknown as PrivateScene;
}

function getState(scene: BuildScene): TradingState {
  let state = states.get(scene);
  if (!state) {
    state = { open: false, cards: [], boundSprites: new WeakSet() };
    states.set(scene, state);
  }
  return state;
}

function getAmount(scene: BuildScene, key: string): number {
  return Number(scenePrivate(scene)[key] ?? 0);
}

function setAmount(scene: BuildScene, key: string, value: number): void {
  scenePrivate(scene)[key] = Math.max(0, value);
}

function canPay(scene: BuildScene, trade: Trade): boolean {
  return trade.cost.every((item: CostItem) => getAmount(scene, item.resource) >= item.amount);
}

function formatCost(trade: Trade): string {
  return trade.cost
    .map((item: CostItem) => `${RESOURCE_NAMES[item.resource]} ${item.amount}`)
    .join(' / ');
}

function getOwned(scene: BuildScene, trade: Trade): number {
  return getAmount(scene, trade.id);
}

function refreshResources(scene: BuildScene): void {
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function toast(scene: BuildScene, message: string): void {
  (scene as unknown as { showToast?: (message: string) => void }).showToast?.call(scene, message);
}

function buy(scene: BuildScene, state: TradingState, trade: Trade): void {
  if (!canPay(scene, trade)) {
    toast(scene, '资源不足');
    return;
  }

  if ('max' in trade && trade.max === 1 && getOwned(scene, trade) >= 1) {
    toast(scene, `${trade.name}已经拥有`);
    return;
  }

  for (const item of trade.cost) setAmount(scene, item.resource, getAmount(scene, item.resource) - item.amount);
  setAmount(scene, trade.id, getOwned(scene, trade) + 1);
  refreshResources(scene);
  toast(scene, `交易完成：${trade.name} +1`);
  refreshPanel(scene, state);
}

function refreshPanel(scene: BuildScene, state: TradingState): void {
  for (const card of state.cards) {
    const owned = getOwned(scene, card.trade);
    card.ownText.setText(`持有 ${owned}`);
    card.costText.setText(formatCost(card.trade));
    const soldOut = 'max' in card.trade && card.trade.max === 1 && owned >= 1;
    const affordable = canPay(scene, card.trade) && !soldOut;
    card.buyBg.setFillStyle(affordable ? 0x4f7049 : 0x485048, 1);
    card.buyText.setText(soldOut ? '已拥有' : affordable ? '交易' : '不足');
    card.buyText.setColor(affordable ? '#ffffff' : '#a7aea4');
  }

  if (state.resourceSummary) {
    const keys = ['fur', 'scales', 'teeth', 'wood'];
    state.resourceSummary.setText(keys.map((key) => `${RESOURCE_NAMES[key as keyof typeof RESOURCE_NAMES]} ${getAmount(scene, key)}`).join('   '));
  }
}

function setOpen(scene: BuildScene, open: boolean): void {
  const state = getState(scene);
  state.open = open;
  state.panel?.setVisible(open);
  if (open) refreshPanel(scene, state);
}

function createPanel(scene: BuildScene): void {
  const state = getState(scene);
  if (state.panel) return;

  const panel = scene.add.container(0, 0).setDepth(12000).setVisible(false);
  const shade = scene.add.rectangle(0, 0, 1400, 2200, 0x111511, 0.72).setInteractive();
  const bg = scene.add.rectangle(0, 0, 940, 1500, 0x202720, 0.995).setStrokeStyle(3, 0x829270, 1).setInteractive();
  const title = scene.add.text(-390, -690, '交易站', {
    fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#fff0d2', fontStyle: 'bold',
  });
  const sub = scene.add.text(-390, -642, '用狩猎与探索物资交换中后期资源和装备', {
    fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebba5',
  });
  const summary = scene.add.text(-390, -600, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#d8e0c9',
  });
  state.resourceSummary = summary;
  const closeBg = scene.add.circle(390, -684, 30, 0x4b5849, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(390, -685, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
  panel.add([shade, bg, title, sub, summary, closeBg, closeText]);

  TRADES.forEach((trade, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = col === 0 ? -230 : 230;
    const y = -505 + row * 174;
    const cardBg = scene.add.rectangle(x, y, 410, 146, 0x2c352d, 1).setStrokeStyle(1, 0x546253, 1);
    const name = scene.add.text(x - 180, y - 54, trade.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#fff1d5', fontStyle: 'bold',
    });
    const costText = scene.add.text(x - 180, y - 15, formatCost(trade), {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#b9c5ad', wordWrap: { width: 270 },
    });
    const ownText = scene.add.text(x - 180, y + 42, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#e4d69e',
    });
    const buyBg = scene.add.rectangle(x + 125, y + 38, 112, 48, 0x4f7049, 1)
      .setStrokeStyle(1, 0x789171, 1)
      .setInteractive({ useHandCursor: true });
    const buyText = scene.add.text(x + 125, y + 38, '交易', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    buyBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      buy(scene, state, trade);
    });

    state.cards.push({ trade, costText, ownText, buyBg, buyText });
    panel.add([cardBg, name, costText, ownText, buyBg, buyText]);
  });

  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    setOpen(scene, false);
  });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());

  state.panel = panel;
}

function bindTradingPost(scene: BuildScene): void {
  const state = getState(scene);
  const placed = (scenePrivate(scene).placed as Array<{ id: string; sprite: Phaser.GameObjects.Image }> | undefined) ?? [];
  const posts = placed.filter((item) => item.id === 'tradingPost');
  for (const post of posts) {
    if (state.boundSprites.has(post.sprite)) continue;
    state.boundSprites.add(post.sprite);
    post.sprite.setInteractive({ useHandCursor: true });
    post.sprite.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      setOpen(scene, true);
    });
  }
}

function updatePosition(scene: BuildScene): void {
  const state = getState(scene);
  if (!state.panel) return;
  const view = scene.cameras.main.worldView;
  state.panel.setPosition(view.centerX, view.centerY);
}

export function installTradingPostPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__tradingPostPatched) return;
  marker.__tradingPostPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    getState(this);
    createPanel(this);
    bindTradingPost(this);
    updatePosition(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    bindTradingPost(this);
    updatePosition(this);
    const state = getState(this);
    if (state.open) refreshPanel(this, state);
    return result;
  };
}
