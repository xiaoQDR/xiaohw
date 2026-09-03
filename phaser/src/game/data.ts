import type { BuildDefinition, CraftDefinition, Job, Resource } from './types';

export const RESOURCE_NAMES: Record<Resource, string> = {
  wood: '木材', food: '熏肉', fur: '毛皮', bait: '诱饵', leather: '皮革',
  iron: '铁', coal: '煤', steel: '钢', medicine: '药剂', charm: '护符',
};

export const FIRE_NAMES = ['熄灭', '微光', '闪烁', '燃烧', '熊熊燃烧'];

export const BUILDINGS: BuildDefinition[] = [
  { id: 'trap', name: '陷阱', description: '定期获得毛皮与肉', cost: [{ resource: 'wood', amount: 10 }], max: 10 },
  { id: 'cart', name: '手推车', description: '采集木材数量翻倍', cost: [{ resource: 'wood', amount: 30 }], max: 1 },
  { id: 'hut', name: '小屋', description: '村庄人口上限 +4', cost: [{ resource: 'wood', amount: 80 }], max: 20 },
  { id: 'lodge', name: '猎人小屋', description: '解锁猎人与陷阱师', cost: [{ resource: 'wood', amount: 200 }, { resource: 'fur', amount: 10 }], max: 1 },
  { id: 'tradingPost', name: '交易站', description: '解锁药剂与护符交易', cost: [{ resource: 'wood', amount: 400 }, { resource: 'fur', amount: 100 }], max: 1 },
  { id: 'tannery', name: '制革屋', description: '解锁制革师', cost: [{ resource: 'wood', amount: 500 }, { resource: 'fur', amount: 50 }], max: 1 },
  { id: 'smokehouse', name: '熏肉房', description: '解锁熏肉师', cost: [{ resource: 'wood', amount: 600 }], max: 1 },
  { id: 'workshop', name: '工坊', description: '解锁装备制作与荒野', cost: [{ resource: 'wood', amount: 800 }, { resource: 'leather', amount: 10 }], max: 1 },
  { id: 'steelworks', name: '炼钢坊', description: '将铁与煤炼成钢', cost: [{ resource: 'wood', amount: 1200 }, { resource: 'iron', amount: 100 }, { resource: 'coal', amount: 100 }], requires: 'workshop', max: 1 },
  { id: 'armoury', name: '军械库', description: '解锁高级武器', cost: [{ resource: 'wood', amount: 2000 }, { resource: 'steel', amount: 100 }], requires: 'steelworks', max: 1 },
];

export const CRAFTS: CraftDefinition[] = [
  { id: 'rucksack', name: '帆布包', description: '荒野携带更多补给', cost: [{ resource: 'leather', amount: 5 }], max: 1 },
  { id: 'waterskin', name: '水袋', description: '荒野初始水量 +10', cost: [{ resource: 'leather', amount: 10 }], max: 1 },
  { id: 'spear', name: '骨矛', description: '战斗伤害 +2', cost: [{ resource: 'wood', amount: 100 }, { resource: 'fur', amount: 20 }], max: 1 },
  { id: 'compass', name: '罗盘', description: '解锁荒野探索', cost: [{ resource: 'iron', amount: 20 }, { resource: 'leather', amount: 10 }], max: 1 },
  { id: 'rifle', name: '旧步枪', description: '战斗伤害大幅提升', cost: [{ resource: 'steel', amount: 20 }, { resource: 'wood', amount: 200 }], max: 1 },
];

export const JOB_NAMES: Record<Job, string> = {
  gatherer: '伐木工', hunter: '猎人', trapper: '陷阱师', tanner: '制革师',
  charcutier: '熏肉师', ironMiner: '铁矿工', coalMiner: '煤矿工', steelworker: '炼钢工',
};

export const JOB_PRODUCTION: Record<Job, Partial<Record<Resource, number>>> = {
  gatherer: { wood: 1 },
  hunter: { food: 0.5, fur: 0.25 },
  trapper: { bait: -0.25, food: 0.75, fur: 0.5 },
  tanner: { fur: -1, leather: 0.5 },
  charcutier: { food: 1 },
  ironMiner: { iron: 0.4 },
  coalMiner: { coal: 0.4 },
  steelworker: { iron: -1, coal: -1, steel: 0.5 },
};
