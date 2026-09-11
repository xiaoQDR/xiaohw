import Phaser from 'phaser';
import { BuildScene } from '../scenes/BuildScene';

type AnyFn = (...args: any[]) => any;
type ResourceKey = 'wood' | 'fur' | 'meat' | 'bait' | 'scales' | 'teeth' | 'cloth' | 'medicine' | 'charm';
type Cost = Partial<Record<ResourceKey, number>>;
type NextScene = string | Array<{ under: number; scene: string }>;

type EventButton = {
  text: string;
  cost?: Cost;
  reward?: Cost;
  available?: (scene: BuildScene) => boolean;
  nextScene?: NextScene;
  action?: (scene: BuildScene) => void;
};

type EventScene = {
  text: string[];
  notification?: string;
  reward?: Cost;
  onLoad?: (scene: BuildScene) => void;
  buttons: Record<string, EventButton>;
};

type OriginalEvent = {
  id: string;
  title: string;
  isAvailable: (scene: BuildScene) => boolean;
  scenes: Record<string, EventScene>;
};

type EventState = {
  nextEventAt: number;
  activeEvent?: OriginalEvent;
  activeScene?: string;
  panel?: Phaser.GameObjects.Container;
};

const EVENT_MIN_MS = 3 * 60 * 1000;
const EVENT_MAX_MS = 6 * 60 * 1000;
const states = new WeakMap<BuildScene, EventState>();

function getPrivate<T>(scene: BuildScene, key: string): T | undefined {
  return (scene as unknown as Record<string, unknown>)[key] as T | undefined;
}

function setPrivate(scene: BuildScene, key: string, value: unknown): void {
  (scene as unknown as Record<string, unknown>)[key] = value;
}

function getResource(scene: BuildScene, key: ResourceKey): number {
  return Number(getPrivate<number>(scene, key) ?? 0);
}

function addResource(scene: BuildScene, key: ResourceKey, amount: number): void {
  setPrivate(scene, key, Math.max(0, getResource(scene, key) + amount));
}

function applyResources(scene: BuildScene, values?: Cost, sign = 1): void {
  if (!values) return;
  for (const [key, amount] of Object.entries(values)) addResource(scene, key as ResourceKey, Number(amount) * sign);
}

function canPay(scene: BuildScene, cost?: Cost): boolean {
  if (!cost) return true;
  return Object.entries(cost).every(([key, amount]) => getResource(scene, key as ResourceKey) >= Number(amount));
}

function refresh(scene: BuildScene): void {
  (scene as unknown as { refreshResources?: () => void }).refreshResources?.call(scene);
}

function toast(scene: BuildScene, message: string): void {
  (scene as unknown as { showToast?: (message: string) => void }).showToast?.call(scene, message);
}

function getPopulation(scene: BuildScene): number {
  return Number(getPrivate<number>(scene, 'population') ?? 0);
}

function killVillagers(scene: BuildScene, count: number): void {
  const workers = getPrivate<Phaser.GameObjects.Image[]>(scene, 'workers') ?? [];
  const actual = Math.min(Math.max(0, count), getPopulation(scene));
  for (let i = 0; i < actual; i += 1) {
    const worker = workers.pop();
    if (worker) {
      scene.tweens.killTweensOf(worker);
      worker.destroy();
    }
  }
  setPrivate(scene, 'population', getPopulation(scene) - actual);
  refresh(scene);
}

function buildingCount(scene: BuildScene, id: string): number {
  const placed = getPrivate<Array<{ id: string }>>(scene, 'placed') ?? [];
  return placed.filter((item) => item.id === id).length;
}

function destroyOneHut(scene: BuildScene): void {
  const placed = getPrivate<Array<{ id: string; col: number; row: number; sprite: Phaser.GameObjects.Image }>>(scene, 'placed') ?? [];
  const index = placed.findIndex((item) => item.id === 'hut');
  if (index < 0) return;
  const hut = placed[index];
  getPrivate<Set<string>>(scene, 'occupied')?.delete(`${hut.col},${hut.row}`);
  placed.splice(index, 1);
  hut.sprite.destroy();
  killVillagers(scene, Math.min(4, getPopulation(scene)));
  (scene as unknown as { recalculatePopulationCap?: () => void }).recalculatePopulationCap?.call(scene);
}

function resolveNext(next?: NextScene): string | undefined {
  if (!next) return undefined;
  if (typeof next === 'string') return next;
  const roll = Math.random();
  for (const branch of next) if (roll < branch.under) return branch.scene;
  return next[next.length - 1]?.scene;
}

function formatCost(cost?: Cost): string {
  if (!cost) return '';
  const labels: Record<ResourceKey, string> = {
    wood: '木材', fur: '毛皮', meat: '肉', bait: '诱饵', scales: '鳞片', teeth: '牙齿', cloth: '布料', medicine: '药剂', charm: '护符',
  };
  return Object.entries(cost).map(([key, amount]) => `${labels[key as ResourceKey]} ${amount}`).join(' / ');
}

const EVENTS: OriginalEvent[] = [
  {
    id: 'nomad', title: '游牧商人',
    isAvailable: (s) => getResource(s, 'fur') > 0,
    scenes: {
      start: {
        text: ['一个游牧商人拖着用粗绳捆住的破袋子走进营地。', '他不说自己从哪里来，但显然不会久留。'],
        notification: '一个游牧商人来做生意。',
        buttons: {
          scales: { text: '购买鳞片', cost: { fur: 100 }, reward: { scales: 1 } },
          teeth: { text: '购买牙齿', cost: { fur: 200 }, reward: { teeth: 1 } },
          bait: { text: '购买诱饵', cost: { fur: 5 }, reward: { bait: 1 } },
          leave: { text: '告别', nextScene: 'end' },
        },
      },
      end: { text: ['商人收好货物，很快消失在森林里。'], buttons: { close: { text: '结束' } } },
    },
  },
  {
    id: 'noises_outside', title: '屋外的声音',
    isAvailable: (s) => getResource(s, 'wood') > 0,
    scenes: {
      start: {
        text: ['墙外传来拖曳和摩擦的声音。', '不知道外面有什么东西。'],
        notification: '墙外传来奇怪的声音。',
        buttons: {
          investigate: { text: '出去查看', nextScene: [{ under: 0.3, scene: 'stuff' }, { under: 1, scene: 'nothing' }] },
          ignore: { text: '忽略', nextScene: 'end' },
        },
      },
      stuff: { text: ['门外放着一捆树枝，外面包着粗糙的毛皮。', '夜色重新安静下来。'], reward: { wood: 100, fur: 10 }, buttons: { back: { text: '回去', nextScene: 'end' } } },
      nothing: { text: ['模糊的影子在视野边缘移动。', '声音突然停止了。'], buttons: { back: { text: '回去', nextScene: 'end' } } },
      end: { text: ['没有别的事情发生。'], buttons: { close: { text: '结束' } } },
    },
  },
  {
    id: 'noises_inside', title: '储藏室里的声音',
    isAvailable: (s) => getResource(s, 'wood') > 0,
    scenes: {
      start: {
        text: ['储藏室里传来抓挠声。', '有什么东西闯进去了。'],
        buttons: {
          investigate: { text: '查看', nextScene: [{ under: 0.5, scene: 'scales' }, { under: 0.8, scene: 'teeth' }, { under: 1, scene: 'cloth' }] },
          ignore: { text: '忽略', nextScene: 'end' },
        },
      },
      scales: { text: ['一些木材不见了。', '地上散落着细小的鳞片。'], onLoad: (s) => convertWood(s, 'scales'), buttons: { close: { text: '离开', nextScene: 'end' } } },
      teeth: { text: ['一些木材不见了。', '地上散落着细小的牙齿。'], onLoad: (s) => convertWood(s, 'teeth'), buttons: { close: { text: '离开', nextScene: 'end' } } },
      cloth: { text: ['一些木材不见了。', '地上留着破碎的布料。'], onLoad: (s) => convertWood(s, 'cloth'), buttons: { close: { text: '离开', nextScene: 'end' } } },
      end: { text: ['储藏室重新安静下来。'], buttons: { close: { text: '结束' } } },
    },
  },
  {
    id: 'beggar', title: '乞丐',
    isAvailable: (s) => getResource(s, 'fur') > 0,
    scenes: {
      start: {
        text: ['一个乞丐来到营地。', '他请求一些毛皮，好熬过夜里的寒冷。'],
        buttons: {
          give50: { text: '给 50 毛皮', cost: { fur: 50 }, nextScene: [{ under: 0.5, scene: 'scales' }, { under: 0.8, scene: 'teeth' }, { under: 1, scene: 'cloth' }] },
          give100: { text: '给 100 毛皮', cost: { fur: 100 }, nextScene: [{ under: 0.5, scene: 'teeth' }, { under: 0.8, scene: 'scales' }, { under: 1, scene: 'cloth' }] },
          deny: { text: '赶走他', nextScene: 'end' },
        },
      },
      scales: { text: ['乞丐表示感谢，留下了一堆鳞片。'], reward: { scales: 20 }, buttons: { close: { text: '告别', nextScene: 'end' } } },
      teeth: { text: ['乞丐表示感谢，留下了一堆牙齿。'], reward: { teeth: 20 }, buttons: { close: { text: '告别', nextScene: 'end' } } },
      cloth: { text: ['乞丐表示感谢，留下了一些布料。'], reward: { cloth: 20 }, buttons: { close: { text: '告别', nextScene: 'end' } } },
      end: { text: ['乞丐消失在树林中。'], buttons: { close: { text: '结束' } } },
    },
  },
  {
    id: 'hut_fire', title: '火灾',
    isAvailable: (s) => buildingCount(s, 'hut') > 0 && getPopulation(s) > 50,
    scenes: {
      start: {
        text: ['大火吞没了一间小屋。', '住在里面的人没能逃出来。'],
        notification: '一间小屋起火了。',
        onLoad: destroyOneHut,
        buttons: { mourn: { text: '哀悼', nextScene: 'end' } },
      },
      end: { text: ['村民埋葬死者，重新开始工作。'], buttons: { close: { text: '结束' } } },
    },
  },
  {
    id: 'sickness', title: '疾病',
    isAvailable: (s) => getPopulation(s) > 10 && getPopulation(s) < 50 && getResource(s, 'medicine') > 0,
    scenes: {
      start: {
        text: ['疾病正在村庄中蔓延。', '必须尽快使用药剂。'],
        buttons: {
          heal: { text: '使用 1 药剂', cost: { medicine: 1 }, nextScene: 'healed' },
          ignore: { text: '不处理', nextScene: 'death' },
        },
      },
      healed: { text: ['疾病及时被控制住了。'], buttons: { close: { text: '结束', nextScene: 'end' } } },
      death: { text: ['疾病蔓延开来。', '白天都在埋葬死者。'], onLoad: (s) => killVillagers(s, Phaser.Math.Between(1, Math.max(1, Math.floor(getPopulation(s) / 2)))), buttons: { close: { text: '结束', nextScene: 'end' } } },
      end: { text: ['村庄恢复了安静。'], buttons: { close: { text: '关闭' } } },
    },
  },
  {
    id: 'plague', title: '瘟疫',
    isAvailable: (s) => getPopulation(s) > 50 && getResource(s, 'medicine') > 0,
    scenes: {
      start: {
        text: ['可怕的瘟疫正在迅速扩散。', '村庄急需药剂。'],
        buttons: {
          buy: { text: '购买 1 药剂', cost: { scales: 70, teeth: 50 }, reward: { medicine: 1 } },
          heal: { text: '使用 5 药剂', cost: { medicine: 5 }, nextScene: 'healed' },
          ignore: { text: '什么也不做', nextScene: 'death' },
        },
      },
      healed: { text: ['瘟疫最终被控制，但还是死了几个人。'], onLoad: (s) => killVillagers(s, Phaser.Math.Between(2, 6)), buttons: { close: { text: '结束', nextScene: 'end' } } },
      death: { text: ['瘟疫席卷村庄。', '几乎没有人能逃过。'], onLoad: (s) => killVillagers(s, Phaser.Math.Between(10, 89)), buttons: { close: { text: '结束', nextScene: 'end' } } },
      end: { text: ['幸存者重新聚到火堆旁。'], buttons: { close: { text: '关闭' } } },
    },
  },
  {
    id: 'beast_attack', title: '野兽袭击',
    isAvailable: (s) => getPopulation(s) > 0,
    scenes: {
      start: {
        text: ['一群咆哮的野兽从树林里扑出来。', '战斗短暂而血腥，但野兽最终被击退。', '村民开始哀悼死者。'],
        notification: '野兽袭击了村庄。',
        onLoad: (s) => killVillagers(s, Phaser.Math.Between(1, 10)),
        reward: { fur: 100, meat: 100, teeth: 10 },
        buttons: { close: { text: '回到营地', nextScene: 'end' } },
      },
      end: { text: ['猎食者变成了猎物。'], buttons: { close: { text: '结束' } } },
    },
  },
];

function convertWood(scene: BuildScene, target: 'scales' | 'teeth' | 'cloth'): void {
  let wood = Math.floor(getResource(scene, 'wood') * 0.1);
  if (wood === 0) wood = 1;
  let reward = Math.floor(wood / 5);
  if (reward === 0) reward = 1;
  addResource(scene, 'wood', -wood);
  addResource(scene, target, reward);
  refresh(scene);
}

function getState(scene: BuildScene): EventState {
  let state = states.get(scene);
  if (!state) {
    state = { nextEventAt: scene.time.now + Phaser.Math.Between(EVENT_MIN_MS, EVENT_MAX_MS) };
    states.set(scene, state);
  }
  return state;
}

function scheduleNext(scene: BuildScene): void {
  getState(scene).nextEventAt = scene.time.now + Phaser.Math.Between(EVENT_MIN_MS, EVENT_MAX_MS);
}

function chooseEvent(scene: BuildScene): OriginalEvent | undefined {
  const pool = EVENTS.filter((event) => event.isAvailable(scene));
  return pool.length ? Phaser.Utils.Array.GetRandom(pool) : undefined;
}

function closeEvent(scene: BuildScene): void {
  const state = getState(scene);
  state.panel?.destroy(true);
  state.panel = undefined;
  state.activeEvent = undefined;
  state.activeScene = undefined;
  scheduleNext(scene);
}

function loadScene(scene: BuildScene, name: string): void {
  const state = getState(scene);
  const event = state.activeEvent;
  if (!event) return;
  if (name === 'end' && !event.scenes.end) {
    closeEvent(scene);
    return;
  }
  const eventScene = event.scenes[name];
  if (!eventScene) {
    closeEvent(scene);
    return;
  }
  state.activeScene = name;
  eventScene.onLoad?.(scene);
  applyResources(scene, eventScene.reward, 1);
  refresh(scene);
  if (eventScene.notification) toast(scene, eventScene.notification);
  renderPanel(scene, event, eventScene);
}

function renderPanel(scene: BuildScene, event: OriginalEvent, eventScene: EventScene): void {
  const state = getState(scene);
  state.panel?.destroy(true);
  const view = scene.cameras.main.worldView;
  const panel = scene.add.container(view.centerX, view.centerY).setDepth(9000);
  state.panel = panel;

  const shade = scene.add.rectangle(0, 0, view.width + 300, view.height + 300, 0x101510, 0.62).setInteractive();
  const bg = scene.add.rectangle(0, 0, 840, 760, 0x202a22, 0.99).setStrokeStyle(4, 0x7e916d, 1).setInteractive();
  const tag = scene.add.text(-360, -325, '事件', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#aabd98', fontStyle: 'bold' });
  const title = scene.add.text(-360, -282, event.title, { fontFamily: 'system-ui, sans-serif', fontSize: '40px', color: '#fff1d4', fontStyle: 'bold' });
  const body = scene.add.text(-360, -210, eventScene.text.join('\n\n'), { fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#d5dec9', wordWrap: { width: 720 }, lineSpacing: 6 });
  panel.add([shade, bg, tag, title, body]);

  const entries = Object.values(eventScene.buttons).filter((button) => button.available ? button.available(scene) : true);
  const startY = 100;
  entries.forEach((button, index) => {
    const y = startY + index * 105;
    const affordable = canPay(scene, button.cost);
    const rect = scene.add.rectangle(0, y, 700, 78, affordable ? 0x41533f : 0x303630, 1).setStrokeStyle(2, affordable ? 0x849879 : 0x555d55, 1);
    const suffix = button.cost ? `  ·  ${formatCost(button.cost)}` : '';
    const label = scene.add.text(0, y, `${button.text}${suffix}`, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: affordable ? '#fff3db' : '#777f77', fontStyle: 'bold' }).setOrigin(0.5);
    panel.add([rect, label]);
    if (!affordable) return;
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, inputEvent: Phaser.Types.Input.EventData) => {
      inputEvent.stopPropagation();
      applyResources(scene, button.cost, -1);
      applyResources(scene, button.reward, 1);
      button.action?.(scene);
      refresh(scene);
      const next = resolveNext(button.nextScene);
      if (next) loadScene(scene, next);
      else closeEvent(scene);
    });
  });
}

function openEvent(scene: BuildScene, event: OriginalEvent): void {
  const state = getState(scene);
  state.activeEvent = event;
  loadScene(scene, 'start');
}

function tick(scene: BuildScene): void {
  const state = getState(scene);
  if (state.activeEvent) {
    const view = scene.cameras.main.worldView;
    state.panel?.setPosition(view.centerX, view.centerY);
    return;
  }
  if (scene.time.now < state.nextEventAt) return;
  const event = chooseEvent(scene);
  if (event) openEvent(scene, event);
  else scheduleNext(scene);
}

export function installEventSystemPatch(): void {
  const proto = BuildScene.prototype as unknown as Record<string, AnyFn>;
  const marker = proto as unknown as Record<string, unknown>;
  if (marker.__eventSystemPatched) return;
  marker.__eventSystemPatched = true;

  const originalCreate = proto.create;
  const originalUpdate = proto.update;

  proto.create = function patchedCreate(this: BuildScene, ...args: any[]) {
    const result = originalCreate.apply(this, args);
    for (const key of ['medicine', 'scales', 'teeth', 'cloth', 'bait', 'charm']) {
      if (getPrivate<number>(this, key) == null) setPrivate(this, key, 0);
    }
    getState(this);
    return result;
  };

  proto.update = function patchedUpdate(this: BuildScene, ...args: any[]) {
    const result = originalUpdate.apply(this, args);
    tick(this);
    return result;
  };
}
