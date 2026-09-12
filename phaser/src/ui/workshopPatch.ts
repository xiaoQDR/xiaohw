import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';
import { CRAFTS, RESOURCE_NAMES } from '../game/data';
import type { Resource } from '../game/types';

type AnyFn = (...args: any[]) => any;
type CraftState = {
  panel: Phaser.GameObjects.Container;
  open: boolean;
  attachedTo?: Phaser.GameObjects.Image;
  rows: Array<{ id: string; owned: Phaser.GameObjects.Text; cost: Phaser.GameObjects.Text; button: Phaser.GameObjects.Rectangle; buttonText: Phaser.GameObjects.Text }>;
};

const states = new WeakMap<BuildScene, CraftState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}
function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}
function getResource(scene: BuildScene, key: Resource): number { return Number(getPrivate<number>(scene, key) ?? 0); }
function setResource(scene: BuildScene, key: Resource, value: number): void { setPrivate(scene, key, Math.max(0, value)); }
function refreshResources(scene: BuildScene): void { (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene); }
function showToast(scene: BuildScene, message: string): void { (scene as unknown as { showToast?: (message: string) => void }).showToast?.call(scene, message); }
function getCrafted(scene: BuildScene): Record<string, number> {
  let crafted = getPrivate<Record<string, number>>(scene, 'craftedItems');
  if (!crafted) { crafted = {}; setPrivate(scene, 'craftedItems', crafted); }
  return crafted;
}
function workshopBuilding(scene: BuildScene): Phaser.GameObjects.Image | undefined {
  const placed = getPrivate<Array<{ id: string; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  return placed.find((building) => building.id === 'workshop')?.sprite;
}
function positionPanel(scene: BuildScene, state: CraftState): void {
  const view = scene.cameras.main.worldView;
  state.panel.setPosition(view.centerX, view.centerY - 40).setDepth(7200);
}
function canCraft(scene: BuildScene, craft: (typeof CRAFTS)[number]): boolean {
  const crafted = getCrafted(scene);
  if (craft.max && (crafted[craft.id] ?? 0) >= craft.max) return false;
  return craft.cost.every((cost) => getResource(scene, cost.resource) >= cost.amount);
}
function doCraft(scene: BuildScene, craft: (typeof CRAFTS)[number]): void {
  if (!canCraft(scene, craft)) { showToast(scene, '材料不足或已达到上限'); return; }
  for (const cost of craft.cost) setResource(scene, cost.resource, getResource(scene, cost.resource) - cost.amount);
  const amount = craft.quantity ?? 1;
  const crafted = getCrafted(scene);
  crafted[craft.id] = (crafted[craft.id] ?? 0) + amount;
  if (craft.id === 'torch') setResource(scene, 'torch', getResource(scene, 'torch') + amount);
  refreshResources(scene);
  showToast(scene, `制作完成：${craft.name}`);
}
function refreshPanel(scene: BuildScene, state: CraftState): void {
  const crafted = getCrafted(scene);
  CRAFTS.forEach((craft, index) => {
    const row = state.rows[index];
    if (!row) return;
    const count = crafted[craft.id] ?? 0;
    row.owned.setText(craft.max ? `${count}/${craft.max}` : `已有 ${count}`);
    row.cost.setText(craft.cost.map((cost) => `${RESOURCE_NAMES[cost.resource]} ${cost.amount}`).join(' · '));
    const enabled = canCraft(scene, craft);
    row.button.setFillStyle(enabled ? 0x526d4f : 0x3b443c, 1);
    row.buttonText.setColor(enabled ? '#fff2ce' : '#8f998d');
  });
}
function createPanel(scene: BuildScene): CraftState {
  const panel = scene.add.container(0, 0).setVisible(false);
  const bg = scene.add.rectangle(0, 0, 900, 1050, 0x1e2921, 0.99).setStrokeStyle(3, 0x7c8f70, 1).setInteractive();
  const title = scene.add.text(-400, -485, '工坊 · 制作', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#fff1d5', fontStyle: 'bold' });
  const sub = scene.add.text(-400, -440, '制作远行工具、容量升级、护甲与武器', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#a9b99e' });
  const close = scene.add.rectangle(390, -480, 54, 48, 0x465649, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(390, -481, '×', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#fff' }).setOrigin(0.5);
  panel.add([bg, title, sub, close, closeText]);
  const rows: CraftState['rows'] = [];
  CRAFTS.forEach((craft, index) => {
    const col = index % 2;
    const rowIndex = Math.floor(index / 2);
    const x = -215 + col * 430;
    const y = -365 + rowIndex * 118;
    const card = scene.add.rectangle(x, y, 400, 104, 0x2d3930, 1).setStrokeStyle(1, 0x536653, 1);
    const name = scene.add.text(x - 178, y - 38, craft.name, { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#fff4dc', fontStyle: 'bold' });
    const desc = scene.add.text(x - 178, y - 8, craft.description, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#9fac96' });
    const cost = scene.add.text(x - 178, y + 20, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#cdbb91' });
    const owned = scene.add.text(x + 72, y - 37, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#9fc48e' });
    const button = scene.add.rectangle(x + 145, y + 25, 82, 38, 0x526d4f, 1).setStrokeStyle(1, 0x819276, 1).setInteractive({ useHandCursor: true });
    const buttonText = scene.add.text(x + 145, y + 24, '制作', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff2ce', fontStyle: 'bold' }).setOrigin(0.5);
    button.on('pointerdown', (_p, _x, _y, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); doCraft(scene, craft); const s = states.get(scene); if (s) refreshPanel(scene, s); });
    panel.add([card, name, desc, cost, owned, button, buttonText]);
    rows.push({ id: craft.id, owned, cost, button, buttonText });
  });
  const state: CraftState = { panel, open: false, rows };
  close.on('pointerdown', (_p, _x, _y, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); state.open = false; panel.setVisible(false); });
  bg.on('pointerdown', (_p, _x, _y, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  positionPanel(scene, state);
  return state;
}
function attachWorkshop(scene: BuildScene, state: CraftState): void {
  const workshop = workshopBuilding(scene);
  if (!workshop || state.attachedTo === workshop) return;
  state.attachedTo = workshop;
  workshop.setInteractive({ useHandCursor: true });
  workshop.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    state.open = true;
    state.panel.setVisible(true);
    refreshPanel(scene, state);
    positionPanel(scene, state);
  });
}

export function installWorkshopPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__workshopPatched) return;
  (proto as Record<string, unknown>).__workshopPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    const state = createPanel(this); states.set(this, state); return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) { attachWorkshop(this, state); positionPanel(this, state); if (state.open) refreshPanel(this, state); }
    return result;
  };
}
