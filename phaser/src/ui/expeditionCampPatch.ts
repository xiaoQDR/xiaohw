import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type GearSlot = 'weapon' | 'armour' | 'bag' | 'water';
type Consumable = 'curedMeat' | 'medicine' | 'bullets';

type ExpeditionState = {
  panel: Phaser.GameObjects.Container;
  shade: Phaser.GameObjects.Rectangle;
  open: boolean;
  active: boolean;
  recruited: boolean;
  reservedWorker?: Phaser.GameObjects.Image;
  selected: Record<GearSlot, string | null>;
  supplies: Record<Consumable, number>;
  populationText: Phaser.GameObjects.Text;
  teamText: Phaser.GameObjects.Text;
  recruitText: Phaser.GameObjects.Text;
  recruitBg: Phaser.GameObjects.Rectangle;
  slotTexts: Record<GearSlot, Phaser.GameObjects.Text>;
  supplyTexts: Record<Consumable, Phaser.GameObjects.Text>;
  summaryText: Phaser.GameObjects.Text;
  warningText: Phaser.GameObjects.Text;
  departBg: Phaser.GameObjects.Rectangle;
  departText: Phaser.GameObjects.Text;
};

const states = new WeakMap<BuildScene, ExpeditionState>();

const SLOT_OPTIONS: Record<GearSlot, string[]> = {
  weapon: ['boneSpear', 'ironSword', 'steelSword', 'rifle'],
  armour: ['lArmour', 'iArmour', 'sArmour'],
  bag: ['rucksack', 'wagon', 'convoy'],
  water: ['waterskin', 'cask', 'waterTank'],
};

const GEAR_NAMES: Record<string, string> = {
  boneSpear: '骨矛', ironSword: '铁剑', steelSword: '钢剑', rifle: '步枪',
  lArmour: '皮甲', iArmour: '铁甲', sArmour: '钢甲',
  rucksack: '帆布包', wagon: '货车', convoy: '车队',
  waterskin: '水袋', cask: '水桶', waterTank: '水箱',
};

const BAG_CAPACITY: Record<string, number> = { rucksack: 20, wagon: 40, convoy: 70 };
const WATER_CAPACITY: Record<string, number> = { waterskin: 20, cask: 30, waterTank: 100 };
const ARMOUR_HP: Record<string, number> = { lArmour: 15, iArmour: 35, sArmour: 55 };
const WEAPON_DAMAGE: Record<string, number> = { boneSpear: 2, ironSword: 4, steelSword: 6, rifle: 5 };
const GEAR_WEIGHT: Record<string, number> = {
  boneSpear: 2, ironSword: 3, steelSword: 4, rifle: 5,
  lArmour: 2, iArmour: 5, sArmour: 8,
  waterskin: 1, cask: 2, waterTank: 5,
};

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function showToast(scene: BuildScene, text: string): void {
  (scene as unknown as { showToast?: (message: string) => void }).showToast?.(text);
}

function refreshResources(scene: BuildScene): void {
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function getResource(scene: BuildScene, key: Consumable): number {
  return Number(getPrivate<number>(scene, key) ?? 0);
}

function setResource(scene: BuildScene, key: Consumable, value: number): void {
  setPrivate(scene, key, Math.max(0, value));
}

function crafted(scene: BuildScene): Record<string, number> {
  return getPrivate<Record<string, number>>(scene, 'craftedItems') ?? {};
}

function owns(scene: BuildScene, id: string): boolean {
  return Number(crafted(scene)[id] ?? 0) > 0;
}

function availableGatherers(scene: BuildScene): Phaser.GameObjects.Image[] {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  return workers.filter((worker) =>
    worker.active &&
    String(worker.getData('job') ?? 'gatherer') === 'gatherer' &&
    !worker.getData('expeditionReserved'),
  );
}

function bagCapacity(state: ExpeditionState): number {
  return state.selected.bag ? (BAG_CAPACITY[state.selected.bag] ?? 8) : 8;
}

function waterCapacity(state: ExpeditionState): number {
  return state.selected.water ? (WATER_CAPACITY[state.selected.water] ?? 0) : 0;
}

function maxHp(state: ExpeditionState): number {
  return state.selected.armour ? (ARMOUR_HP[state.selected.armour] ?? 10) : 10;
}

function attack(state: ExpeditionState): number {
  return state.selected.weapon ? (WEAPON_DAMAGE[state.selected.weapon] ?? 1) : 1;
}

function totalWeight(state: ExpeditionState): number {
  const supplies = state.supplies.curedMeat * 0.5 + state.supplies.medicine + state.supplies.bullets * 0.05;
  const gear = Object.values(state.selected).reduce((sum, id) => sum + (id ? (GEAR_WEIGHT[id] ?? 0) : 0), 0);
  return Math.round((supplies + gear) * 10) / 10;
}

function safeDistance(state: ExpeditionState): number {
  const byFood = state.supplies.curedMeat * 2;
  const byWater = waterCapacity(state);
  return Math.max(0, Math.floor(Math.min(byFood, byWater)));
}

function canDepart(scene: BuildScene, state: ExpeditionState): { ok: boolean; reason: string } {
  if (!state.recruited) return { ok: false, reason: '先征召 1 名远征队员' };
  if (!state.selected.water) return { ok: false, reason: '至少装备一个饮水容器' };
  if (state.supplies.curedMeat < 5) return { ok: false, reason: '至少携带 5 份熏肉' };
  if (state.supplies.curedMeat > getResource(scene, 'curedMeat')) return { ok: false, reason: '营地熏肉不足' };
  if (state.supplies.medicine > getResource(scene, 'medicine')) return { ok: false, reason: '营地药剂不足' };
  if (state.supplies.bullets > getResource(scene, 'bullets')) return { ok: false, reason: '营地子弹不足' };
  if (state.selected.weapon === 'rifle' && state.supplies.bullets <= 0) return { ok: false, reason: '步枪需要携带子弹' };
  if (totalWeight(state) > bagCapacity(state)) return { ok: false, reason: '负重超过行囊容量' };
  return { ok: true, reason: '' };
}

function nextOwned(scene: BuildScene, slot: GearSlot, current: string | null): string | null {
  const owned = SLOT_OPTIONS[slot].filter((id) => owns(scene, id));
  if (owned.length === 0) return null;
  const choices: Array<string | null> = [null, ...owned];
  const index = choices.indexOf(current);
  return choices[(index + 1 + choices.length) % choices.length];
}

function releaseWorker(state: ExpeditionState): void {
  if (!state.reservedWorker?.active) {
    state.reservedWorker = undefined;
    state.recruited = false;
    return;
  }
  state.reservedWorker.setData('expeditionReserved', false);
  state.reservedWorker = undefined;
  state.recruited = false;
}

function recruit(scene: BuildScene, state: ExpeditionState): void {
  if (state.active) return;
  if (state.recruited) {
    releaseWorker(state);
    return;
  }
  const worker = availableGatherers(scene)[0];
  if (!worker) {
    showToast(scene, '没有可征召的采集者');
    return;
  }
  worker.setData('expeditionReserved', true);
  state.reservedWorker = worker;
  state.recruited = true;
}

function changeSupply(scene: BuildScene, state: ExpeditionState, key: Consumable, delta: number): void {
  if (state.active) return;
  const max = Math.floor(getResource(scene, key));
  state.supplies[key] = Phaser.Math.Clamp(state.supplies[key] + delta, 0, max);
}

function depart(scene: BuildScene, state: ExpeditionState): void {
  if (state.active) {
    state.active = false;
    if (state.reservedWorker?.active) state.reservedWorker.setVisible(true);
    setPrivate(scene, 'activeExpedition', undefined);
    showToast(scene, '远征队已返回，装备已归还库存');
    return;
  }
  const check = canDepart(scene, state);
  if (!check.ok) {
    showToast(scene, check.reason);
    return;
  }
  setResource(scene, 'curedMeat', getResource(scene, 'curedMeat') - state.supplies.curedMeat);
  setResource(scene, 'medicine', getResource(scene, 'medicine') - state.supplies.medicine);
  setResource(scene, 'bullets', getResource(scene, 'bullets') - state.supplies.bullets);
  refreshResources(scene);
  state.active = true;
  if (state.reservedWorker?.active) state.reservedWorker.setVisible(false);
  setPrivate(scene, 'activeExpedition', {
    memberCount: 1,
    gear: { ...state.selected },
    supplies: { ...state.supplies },
    capacity: bagCapacity(state),
    water: waterCapacity(state),
    hp: maxHp(state),
    attack: attack(state),
    distance: safeDistance(state),
  });
  showToast(scene, `远征队出发，可安全探索约 ${safeDistance(state)} 格`);
}

function refresh(scene: BuildScene, state: ExpeditionState): void {
  if (state.reservedWorker && !state.reservedWorker.active) releaseWorker(state);
  const population = Number(getPrivate<number>(scene, 'population') ?? 0);
  const available = availableGatherers(scene).length;
  state.populationText.setText(`人口 ${population}    可征召采集者 ${available}`);
  state.teamText.setText(state.active ? '远征队  1 / 1 · 远征中' : `远征队  ${state.recruited ? '1 / 1' : '0 / 1'}`);
  state.recruitText.setText(state.recruited ? '取消征召' : '征召 1 人');
  state.recruitBg.setFillStyle(state.active ? 0x3f4740 : state.recruited ? 0x5a4a3b : (available > 0 ? 0x526a4d : 0x454c45), 1);

  for (const slot of Object.keys(state.slotTexts) as GearSlot[]) {
    const id = state.selected[slot];
    const ownedCount = id ? Number(crafted(scene)[id] ?? 0) : 0;
    state.slotTexts[slot].setText(id ? `${GEAR_NAMES[id]}  ×${ownedCount}` : '未装备  >');
    state.slotTexts[slot].setColor(state.active ? '#8f998d' : '#f4e3b0');
  }

  state.supplyTexts.curedMeat.setText(String(state.supplies.curedMeat));
  state.supplyTexts.medicine.setText(String(state.supplies.medicine));
  state.supplyTexts.bullets.setText(String(state.supplies.bullets));

  const weight = totalWeight(state);
  const capacity = bagCapacity(state);
  state.summaryText.setText(
    `负重 ${weight} / ${capacity}    水 ${waterCapacity(state)}    生命 ${maxHp(state)}    攻击 ${attack(state)}\n预计安全探索：约 ${safeDistance(state)} 格`,
  );
  state.summaryText.setColor(weight > capacity ? '#e39a8f' : '#dce5d0');

  const check = canDepart(scene, state);
  state.warningText.setText(state.active ? '装备正在远征中；返回后自动归还库存。' : check.ok ? '准备完成，可以出发。' : check.reason);
  state.warningText.setColor(state.active || check.ok ? '#a9c998' : '#d6a28f');
  state.departText.setText(state.active ? '返回营地' : '出发');
  state.departBg.setFillStyle(state.active ? 0x6b5847 : (check.ok ? 0x6b7f4c : 0x454c45), 1);
  state.departText.setColor(state.active || check.ok ? '#fff4d6' : '#9ca59a');
}

function layout(scene: BuildScene, state: ExpeditionState): void {
  const view = scene.cameras.main.worldView;
  state.panel.setPosition(view.centerX, view.centerY);
  state.shade.setPosition(0, 0).setSize(view.width + 8, view.height + 8);
}

function setOpen(scene: BuildScene, open: boolean): void {
  const state = states.get(scene);
  if (!state) return;
  state.open = open;
  state.panel.setVisible(open);
  if (open) refresh(scene, state);
}

function createSlot(scene: BuildScene, panel: Phaser.GameObjects.Container, y: number, labelText: string): { bg: Phaser.GameObjects.Rectangle; value: Phaser.GameObjects.Text } {
  const label = scene.add.text(-335, y - 13, labelText, { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#d5dfca', fontStyle: 'bold' });
  const bg = scene.add.rectangle(190, y, 300, 54, 0x3a473b, 1).setStrokeStyle(1, 0x697967, 1).setInteractive({ useHandCursor: true });
  const value = scene.add.text(190, y, '未装备  >', { fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#f4e3b0', fontStyle: 'bold' }).setOrigin(0.5);
  panel.add([label, bg, value]);
  return { bg, value };
}

function createSupplyRow(scene: BuildScene, panel: Phaser.GameObjects.Container, y: number, labelText: string): { minus: Phaser.GameObjects.Rectangle; plus: Phaser.GameObjects.Rectangle; value: Phaser.GameObjects.Text } {
  const label = scene.add.text(-335, y - 13, labelText, { fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#d5dfca', fontStyle: 'bold' });
  const minus = scene.add.rectangle(95, y, 54, 50, 0x485849, 1).setInteractive({ useHandCursor: true });
  const minusText = scene.add.text(95, y - 1, '−', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
  const value = scene.add.text(190, y, '0', { fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#fff0bd', fontStyle: 'bold' }).setOrigin(0.5);
  const plus = scene.add.rectangle(285, y, 54, 50, 0x526a4d, 1).setInteractive({ useHandCursor: true });
  const plusText = scene.add.text(285, y - 1, '+', { fontSize: '27px', color: '#fff' }).setOrigin(0.5);
  panel.add([label, minus, minusText, value, plus, plusText]);
  return { minus, plus, value };
}

function createPanel(scene: BuildScene): ExpeditionState {
  const panel = scene.add.container(0, 0).setDepth(12500).setVisible(false);
  const shade = scene.add.rectangle(0, 0, 1, 1, 0x101410, 0.74).setInteractive();
  const bg = scene.add.rectangle(0, 0, 900, 1460, 0x202820, 0.995).setStrokeStyle(3, 0x829270, 1).setInteractive();
  const title = scene.add.text(-370, -650, '酒馆 · 远征准备', { fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#fff0d2', fontStyle: 'bold' });
  const sub = scene.add.text(-370, -600, '工坊制作装备，酒馆负责装载。只有消耗品在出发时扣除。', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#aebba5' });
  const populationText = scene.add.text(-370, -552, '', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#dbe4d0', fontStyle: 'bold' });
  const closeBg = scene.add.circle(370, -640, 30, 0x4b5849, 1).setInteractive({ useHandCursor: true });
  const closeText = scene.add.text(370, -641, '×', { fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);

  const teamBg = scene.add.rectangle(0, -460, 760, 112, 0x2b352c, 1).setStrokeStyle(2, 0x536453, 1);
  const teamText = scene.add.text(-335, -460, '', { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#f1dc9d', fontStyle: 'bold' }).setOrigin(0, 0.5);
  const recruitBg = scene.add.rectangle(265, -460, 190, 56, 0x526a4d, 1).setStrokeStyle(1, 0x819374, 1).setInteractive({ useHandCursor: true });
  const recruitText = scene.add.text(265, -460, '征召 1 人', { fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

  const gearBg = scene.add.rectangle(0, -185, 760, 400, 0x2b352c, 1).setStrokeStyle(2, 0x536453, 1);
  const gearTitle = scene.add.text(-335, -355, '装备库存', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff4d9', fontStyle: 'bold' });
  const weapon = createSlot(scene, panel, -292, '武器');
  const armour = createSlot(scene, panel, -222, '护甲');
  const bag = createSlot(scene, panel, -152, '背包');
  const water = createSlot(scene, panel, -82, '水具');

  const supplyBg = scene.add.rectangle(0, 160, 760, 250, 0x2b352c, 1).setStrokeStyle(2, 0x536453, 1);
  const supplyTitle = scene.add.text(-335, 58, '远征消耗品', { fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#fff4d9', fontStyle: 'bold' });
  const food = createSupplyRow(scene, panel, 115, '熏肉');
  const medicine = createSupplyRow(scene, panel, 177, '药剂');
  const bullets = createSupplyRow(scene, panel, 239, '子弹');

  const summaryBg = scene.add.rectangle(0, 390, 760, 150, 0x273027, 1).setStrokeStyle(1, 0x4f604f, 1);
  const summaryText = scene.add.text(-335, 345, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#dce5d0', lineSpacing: 9 });
  const warningText = scene.add.text(-335, 442, '', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#d6a28f', wordWrap: { width: 670 } });

  const departBg = scene.add.rectangle(0, 555, 360, 72, 0x454c45, 1).setStrokeStyle(2, 0x7a8c70, 1).setInteractive({ useHandCursor: true });
  const departText = scene.add.text(0, 555, '出发', { fontFamily: 'system-ui, sans-serif', fontSize: '27px', color: '#9ca59a', fontStyle: 'bold' }).setOrigin(0.5);

  panel.add([shade, bg, title, sub, populationText, closeBg, closeText, teamBg, teamText, recruitBg, recruitText, gearBg, gearTitle, supplyBg, supplyTitle, summaryBg, summaryText, warningText, departBg, departText]);

  const state: ExpeditionState = {
    panel, shade, open: false, active: false, recruited: false,
    selected: { weapon: null, armour: null, bag: null, water: null },
    supplies: { curedMeat: 0, medicine: 0, bullets: 0 },
    populationText, teamText, recruitText, recruitBg,
    slotTexts: { weapon: weapon.value, armour: armour.value, bag: bag.value, water: water.value },
    supplyTexts: { curedMeat: food.value, medicine: medicine.value, bullets: bullets.value },
    summaryText, warningText, departBg, departText,
  };
  states.set(scene, state);

  recruitBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); recruit(scene, state); refresh(scene, state); });

  const bindSlot = (slot: GearSlot, bgObject: Phaser.GameObjects.Rectangle) => {
    bgObject.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (state.active) return;
      const owned = SLOT_OPTIONS[slot].filter((id) => owns(scene, id));
      if (owned.length === 0) {
        showToast(scene, `工坊尚未制作可用${slot === 'weapon' ? '武器' : slot === 'armour' ? '护甲' : slot === 'bag' ? '背包' : '水具'}`);
        return;
      }
      state.selected[slot] = nextOwned(scene, slot, state.selected[slot]);
      refresh(scene, state);
    });
  };
  bindSlot('weapon', weapon.bg); bindSlot('armour', armour.bg); bindSlot('bag', bag.bg); bindSlot('water', water.bg);

  const bindSupply = (key: Consumable, row: ReturnType<typeof createSupplyRow>) => {
    row.minus.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); changeSupply(scene, state, key, -1); refresh(scene, state); });
    row.plus.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); changeSupply(scene, state, key, 1); refresh(scene, state); });
  };
  bindSupply('curedMeat', food); bindSupply('medicine', medicine); bindSupply('bullets', bullets);

  departBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); depart(scene, state); refresh(scene, state); });
  closeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); setOpen(scene, false); });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());

  setPrivate(scene, 'openExpeditionCamp', () => setOpen(scene, true));
  layout(scene, state);
  refresh(scene, state);
  return state;
}

export function installExpeditionCampPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  if ((proto as Record<string, unknown>).__expeditionCampPatched) return;
  (proto as Record<string, unknown>).__expeditionCampPatched = true;
  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    createPanel(this);
    return result;
  };
  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    const state = states.get(this);
    if (state) {
      layout(this, state);
      if (state.open) refresh(this, state);
    }
    return result;
  };
}
