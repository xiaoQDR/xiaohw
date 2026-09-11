import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;

type EventEffect = {
  wood?: number;
  meat?: number;
  fur?: number;
  population?: number;
  toast?: string;
};

type EventChoice = {
  label: string;
  condition?: (scene: BuildScene, state: EventState) => boolean;
  disabledText?: string;
  effect: EventEffect | ((scene: BuildScene, state: EventState) => EventEffect);
};

type CampEvent = {
  id: string;
  title: string;
  text: string;
  once?: boolean;
  condition?: (scene: BuildScene, state: EventState) => boolean;
  choices: EventChoice[];
};

type EventState = {
  nextEventAt: number;
  active: boolean;
  panel?: Phaser.GameObjects.Container;
  used: Set<string>;
  meatBonus: number;
  furBonus: number;
};

const states = new WeakMap<BuildScene, EventState>();
const FIRST_EVENT_DELAY = 12000;
const EVENT_DELAY_MIN = 18000;
const EVENT_DELAY_MAX = 30000;
const MENU_H = 430;

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function getState(scene: BuildScene): EventState {
  let state = states.get(scene);
  if (!state) {
    state = {
      nextEventAt: scene.time.now + FIRST_EVENT_DELAY,
      active: false,
      used: new Set<string>(),
      meatBonus: 0,
      furBonus: 0,
    };
    states.set(scene, state);
  }
  return state;
}

function getWood(scene: BuildScene): number {
  return Number(getPrivate<number>(scene, 'wood') ?? 0);
}

function getPopulation(scene: BuildScene): number {
  return Number(getPrivate<number>(scene, 'population') ?? 0);
}

function getPopulationCap(scene: BuildScene): number {
  return Number(getPrivate<number>(scene, 'populationCap') ?? 0);
}

function refresh(scene: BuildScene): void {
  const fn = (scene as unknown as { refreshResources?: () => void }).refreshResources;
  fn?.call(scene);
}

function showToast(scene: BuildScene, message: string): void {
  const fn = (scene as unknown as { showToast?: (message: string) => void }).showToast;
  fn?.call(scene, message);
}

function addPopulation(scene: BuildScene, amount: number): number {
  let current = getPopulation(scene);
  const cap = getPopulationCap(scene);
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];

  if (amount > 0) {
    const actual = Math.max(0, Math.min(amount, cap - current));
    const spawn = (scene as unknown as { spawnWorker?: () => void }).spawnWorker;
    for (let i = 0; i < actual; i += 1) {
      current += 1;
      setPrivate(scene, 'population', current);
      spawn?.call(scene);
    }
    return actual;
  }

  const actual = Math.max(-current, amount);
  const removeCount = Math.abs(actual);
  for (let i = 0; i < removeCount; i += 1) {
    const worker = workers.pop();
    if (worker) {
      scene.tweens.killTweensOf(worker);
      worker.destroy();
    }
  }
  current += actual;
  setPrivate(scene, 'population', current);
  return actual;
}

function applyEffect(scene: BuildScene, state: EventState, effect: EventEffect): void {
  if (effect.wood) setPrivate(scene, 'wood', Math.max(0, getWood(scene) + effect.wood));
  if (effect.meat) state.meatBonus += effect.meat;
  if (effect.fur) state.furBonus += effect.fur;
  if (effect.population) addPopulation(scene, effect.population);
  refresh(scene);
  if (effect.toast) showToast(scene, effect.toast);
}

const EVENTS: CampEvent[] = [
  {
    id: 'wanderer',
    title: '一个流浪者',
    text: '一个疲惫的流浪者停在火堆边。他看起来愿意留下，只需要一个能睡觉的地方。',
    condition: (scene) => getPopulation(scene) < getPopulationCap(scene),
    choices: [
      { label: '让他留下', effect: { population: 1, toast: '流浪者加入了营地' } },
      { label: '让他继续赶路', effect: { toast: '流浪者离开了营地' } },
    ],
  },
  {
    id: 'beggar',
    title: '饥饿的乞丐',
    text: '一个饥饿的人在营地边缘徘徊。他盯着火堆，手里什么都没有。',
    choices: [
      {
        label: '给他 10 木材换物资',
        condition: (scene) => getWood(scene) >= 10,
        disabledText: '木材不足 10',
        effect: { wood: -10, meat: 5, fur: 1, toast: '得到 5 肉和 1 毛皮' },
      },
      { label: '不理会', effect: { toast: '乞丐消失在树林里' } },
    ],
  },
  {
    id: 'thief',
    title: '夜里的小偷',
    text: '夜里传来窸窣声。有人正在木材堆附近翻找。',
    choices: [
      {
        label: '追出去',
        effect: () => Math.random() < 0.55
          ? { wood: 8, toast: '抓住了小偷，还找回了一些木材' }
          : { wood: -6, toast: '小偷逃了，还顺走了一些木材' },
      },
      { label: '守住火堆', effect: { wood: -3, toast: '损失了少量木材，但没人受伤' } },
    ],
  },
  {
    id: 'beast',
    title: '野兽袭击',
    text: '树林突然躁动起来。一头野兽冲向营地，火光让它迟疑了一瞬。',
    condition: (scene) => getPopulation(scene) > 0,
    choices: [
      {
        label: '点燃木柴驱赶（-12 木材）',
        condition: (scene) => getWood(scene) >= 12,
        disabledText: '木材不足 12',
        effect: { wood: -12, meat: 4, fur: 1, toast: '野兽退去，留下了可用的猎物' },
      },
      {
        label: '让村民迎战',
        effect: () => Math.random() < 0.65
          ? { meat: 7, fur: 2, toast: '村民击退野兽，收获了猎物' }
          : { population: -1, toast: '有人在袭击中失踪了' },
      },
    ],
  },
  {
    id: 'sick',
    title: '生病的人',
    text: '一个发烧的人倒在营地入口。他需要照料，也可能把疾病带进来。',
    condition: (scene) => getPopulation(scene) < getPopulationCap(scene),
    choices: [
      {
        label: '收留并照顾（-15 木材）',
        condition: (scene) => getWood(scene) >= 15,
        disabledText: '木材不足 15',
        effect: { wood: -15, population: 1, toast: '病人熬了过去，决定留下' },
      },
      { label: '给些木材让他离开（-5）', condition: (scene) => getWood(scene) >= 5, disabledText: '木材不足 5', effect: { wood: -5, toast: '他带着木材离开了' } },
    ],
  },
  {
    id: 'merchant',
    title: '神秘商人',
    text: '一个披着斗篷的商人来到火堆旁。他不问来历，只想换些木材。',
    choices: [
      {
        label: '20 木材换肉和毛皮',
        condition: (scene) => getWood(scene) >= 20,
        disabledText: '木材不足 20',
        effect: { wood: -20, meat: 12, fur: 3, toast: '交易完成' },
      },
      { label: '拒绝交易', effect: { toast: '商人很快消失在森林里' } },
    ],
  },
  {
    id: 'hut_fire',
    title: '小屋失火',
    text: '干燥的木墙被火星点燃。火势正在向营地蔓延。',
    condition: (scene) => ((getPrivate<Array<{ id: string }>>(scene, 'placed') ?? []).some((b) => b.id === 'hut')),
    choices: [
      {
        label: '拆木灭火（-18 木材）',
        condition: (scene) => getWood(scene) >= 18,
        disabledText: '木材不足 18',
        effect: { wood: -18, toast: '火被扑灭了' },
      },
      { label: '冒险抢救', effect: () => Math.random() < 0.5 ? { wood: -6, toast: '火势被控制住了' } : { wood: -20, toast: '大火烧掉了大量物资' } },
    ],
  },
  {
    id: 'mysterious_noise',
    title: '森林里的声音',
    text: '远处传来规律的敲击声，像是在回应营地里的斧头。',
    once: true,
    choices: [
      { label: '派人查看', effect: () => Math.random() < 0.6 ? { wood: 15, fur: 1, toast: '找到了一处废弃营地' } : { wood: -5, toast: '什么也没找到，只损失了一些补给' } },
      { label: '留在火堆旁', effect: { toast: '声音持续了一会儿，然后消失了' } },
    ],
  },
];

function chooseEvent(scene: BuildScene, state: EventState): CampEvent | undefined {
  const pool = EVENTS.filter((event) => {
    if (event.once && state.used.has(event.id)) return false;
    return event.condition ? event.condition(scene, state) : true;
  });
  return pool.length > 0 ? Phaser.Utils.Array.GetRandom(pool) : undefined;
}

function closePanel(scene: BuildScene, state: EventState, event: CampEvent): void {
  state.panel?.destroy(true);
  state.panel = undefined;
  state.active = false;
  if (event.once) state.used.add(event.id);
  state.nextEventAt = scene.time.now + Phaser.Math.Between(EVENT_DELAY_MIN, EVENT_DELAY_MAX);
}

function openEvent(scene: BuildScene, state: EventState, event: CampEvent): void {
  state.active = true;
  const view = scene.cameras.main.worldView;
  const panel = scene.add.container(view.centerX, view.centerY).setDepth(9000);
  state.panel = panel;

  const shade = scene.add.rectangle(0, 0, view.width + 200, view.height + 200, 0x101510, 0.58).setInteractive();
  const bg = scene.add.rectangle(0, 0, 820, 650, 0x202a22, 0.99)
    .setStrokeStyle(4, 0x7e916d, 1)
    .setInteractive();
  const tag = scene.add.text(-350, -270, '营地事件', {
    fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#aabd98', fontStyle: 'bold',
  });
  const title = scene.add.text(-350, -225, event.title, {
    fontFamily: 'system-ui, sans-serif', fontSize: '40px', color: '#fff1d4', fontStyle: 'bold',
  });
  const text = scene.add.text(-350, -155, event.text, {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#d5dec9',
    wordWrap: { width: 700 }, lineSpacing: 8,
  });
  panel.add([shade, bg, tag, title, text]);

  event.choices.forEach((choice, index) => {
    const y = 75 + index * 105;
    const enabled = choice.condition ? choice.condition(scene, state) : true;
    const btn = scene.add.rectangle(0, y, 690, 78, enabled ? 0x41533f : 0x313831, 1)
      .setStrokeStyle(2, enabled ? 0x849879 : 0x596059, 1);
    const label = scene.add.text(0, y - (enabled ? 0 : 10), choice.label, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: enabled ? '#fff3db' : '#7d867b', fontStyle: 'bold',
    }).setOrigin(0.5);
    panel.add([btn, label]);

    if (!enabled && choice.disabledText) {
      const reason = scene.add.text(0, y + 22, choice.disabledText, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#8b9188',
      }).setOrigin(0.5);
      panel.add(reason);
    }

    if (enabled) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, inputEvent: Phaser.Types.Input.EventData) => {
        inputEvent.stopPropagation();
        const effect = typeof choice.effect === 'function' ? choice.effect(scene, state) : choice.effect;
        applyEffect(scene, state, effect);
        closePanel(scene, state, event);
      });
    }
  });
}

function tick(scene: BuildScene, state: EventState): void {
  if (state.active) {
    const view = scene.cameras.main.worldView;
    state.panel?.setPosition(view.centerX, view.centerY);
    return;
  }
  if (scene.time.now < state.nextEventAt) return;
  const event = chooseEvent(scene, state);
  if (!event) {
    state.nextEventAt = scene.time.now + 5000;
    return;
  }
  openEvent(scene, state, event);
}

function patchResourceDisplay(scene: BuildScene, state: EventState): void {
  const text = getPrivate<Phaser.GameObjects.Text>(scene, 'resourceText');
  if (!text) return;
  const wood = getWood(scene);
  const population = getPopulation(scene);
  const populationCap = getPopulationCap(scene);
  const baseMeat = Number(getPrivate<number>(scene, 'meat') ?? 0);
  const baseFur = Number(getPrivate<number>(scene, 'fur') ?? 0);
  text.setText(`木材 ${wood}   肉 ${baseMeat + state.meatBonus}   毛皮 ${baseFur + state.furBonus}   人口 ${population}/${populationCap}`);
}

export function installEventSystemPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__eventSystemPatched) return;
  marker.__eventSystemPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;
  const originalRefreshResources = proto.refreshResources;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    getState(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tick(this, getState(this));
    return result;
  };

  proto.refreshResources = function patchedRefreshResources(this: BuildScene, ...args: any[]) {
    const result = originalRefreshResources.apply(this, args);
    patchResourceDisplay(this, getState(this));
    return result;
  };
}
