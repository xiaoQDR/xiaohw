import type { BuildDefinition, CraftDefinition, Job, Resource, TradeDefinition } from './types';

export const RESOURCE_NAMES: Record<Resource, string> = {
  wood: '木材', fur: '毛皮', meat: '肉', bait: '诱饵', leather: '皮革', curedMeat: '熏肉',
  iron: '铁', coal: '煤', sulphur: '硫磺', steel: '钢', medicine: '药剂', charm: '护符',
  scales: '鳞片', teeth: '牙齿', cloth: '布料', torch: '火把', bullets: '子弹',
  energyCell: '能量电池', grenade: '手榴弹', bolas: '套索', alienAlloy: '外星合金',
};

export const FIRE_NAMES = ['熄灭', '微光', '闪烁', '燃烧', '熊熊燃烧'];

export const BUILDINGS: BuildDefinition[] = [
  { id: 'trap', name: '陷阱', description: '每次检查可捕获随机物资', cost: n => [{ resource: 'wood', amount: 10 + n * 10 }], max: 10 },
  { id: 'cart', name: '手推车', description: '每次采集获得 50 木材', cost: [{ resource: 'wood', amount: 30 }], max: 1 },
  { id: 'hut', name: '小屋', description: '村庄人口上限 +4', cost: n => [{ resource: 'wood', amount: 100 + n * 50 }], max: 20 },
  { id: 'lodge', name: '猎人小屋', description: '解锁猎人与陷阱师', cost: [{ resource: 'wood', amount: 200 }, { resource: 'fur', amount: 10 }, { resource: 'meat', amount: 5 }], max: 1 },
  { id: 'tradingPost', name: '交易站', description: '解锁原版交易商品', cost: [{ resource: 'wood', amount: 400 }, { resource: 'fur', amount: 100 }], max: 1 },
  { id: 'tannery', name: '制革屋', description: '解锁制革师', cost: [{ resource: 'wood', amount: 500 }, { resource: 'fur', amount: 50 }], max: 1 },
  { id: 'smokehouse', name: '熏肉房', description: '解锁熏肉师', cost: [{ resource: 'wood', amount: 600 }, { resource: 'meat', amount: 50 }], max: 1 },
  { id: 'workshop', name: '工坊', description: '解锁远行装备与武器', cost: [{ resource: 'wood', amount: 800 }, { resource: 'leather', amount: 100 }, { resource: 'scales', amount: 10 }], max: 1 },
  { id: 'steelworks', name: '炼钢坊', description: '解锁炼钢工', cost: [{ resource: 'wood', amount: 1500 }, { resource: 'iron', amount: 100 }, { resource: 'coal', amount: 100 }], requires: 'workshop', max: 1 },
  { id: 'armoury', name: '军械库', description: '解锁军械师与子弹生产', cost: [{ resource: 'wood', amount: 3000 }, { resource: 'steel', amount: 100 }, { resource: 'sulphur', amount: 50 }], requires: 'steelworks', max: 1 },
];

export const CRAFTS: CraftDefinition[] = [
  { id: 'torch', name: '火把', description: '探索部分地点所需', type: 'tool', cost: [{ resource: 'wood', amount: 1 }, { resource: 'cloth', amount: 1 }], quantity: 1, requires: 'workshop' },
  { id: 'waterskin', name: '水袋', description: '远行水量提升至 20', type: 'upgrade', cost: [{ resource: 'leather', amount: 50 }], max: 1, requires: 'workshop' },
  { id: 'cask', name: '水桶', description: '远行水量提升至 30', type: 'upgrade', cost: [{ resource: 'leather', amount: 100 }, { resource: 'iron', amount: 20 }], max: 1, requires: 'workshop' },
  { id: 'waterTank', name: '水箱', description: '远行水量提升至 100', type: 'upgrade', cost: [{ resource: 'iron', amount: 100 }, { resource: 'steel', amount: 50 }], max: 1, requires: 'workshop' },
  { id: 'boneSpear', name: '骨矛', description: '近战伤害 2', type: 'weapon', cost: [{ resource: 'wood', amount: 100 }, { resource: 'teeth', amount: 5 }], requires: 'workshop' },
  { id: 'rucksack', name: '帆布包', description: '行囊容量提升至 20', type: 'upgrade', cost: [{ resource: 'leather', amount: 200 }], max: 1, requires: 'workshop' },
  { id: 'wagon', name: '货车', description: '行囊容量提升至 40', type: 'upgrade', cost: [{ resource: 'wood', amount: 500 }, { resource: 'iron', amount: 100 }], max: 1, requires: 'workshop' },
  { id: 'convoy', name: '车队', description: '行囊容量提升至 70', type: 'upgrade', cost: [{ resource: 'wood', amount: 1000 }, { resource: 'iron', amount: 200 }, { resource: 'steel', amount: 100 }], max: 1, requires: 'workshop' },
  { id: 'lArmour', name: '皮甲', description: '生命上限提升至 15', type: 'upgrade', cost: [{ resource: 'leather', amount: 200 }, { resource: 'scales', amount: 20 }], max: 1, requires: 'workshop' },
  { id: 'iArmour', name: '铁甲', description: '生命上限提升至 35', type: 'upgrade', cost: [{ resource: 'leather', amount: 200 }, { resource: 'iron', amount: 100 }], max: 1, requires: 'workshop' },
  { id: 'sArmour', name: '钢甲', description: '生命上限提升至 55', type: 'upgrade', cost: [{ resource: 'leather', amount: 200 }, { resource: 'steel', amount: 100 }], max: 1, requires: 'workshop' },
  { id: 'ironSword', name: '铁剑', description: '近战伤害 4', type: 'weapon', cost: [{ resource: 'wood', amount: 200 }, { resource: 'leather', amount: 50 }, { resource: 'iron', amount: 20 }], requires: 'workshop' },
  { id: 'steelSword', name: '钢剑', description: '近战伤害 6', type: 'weapon', cost: [{ resource: 'wood', amount: 500 }, { resource: 'leather', amount: 100 }, { resource: 'steel', amount: 20 }], requires: 'workshop' },
  { id: 'rifle', name: '步枪', description: '远程伤害 5，消耗子弹', type: 'weapon', cost: [{ resource: 'wood', amount: 200 }, { resource: 'steel', amount: 50 }, { resource: 'sulphur', amount: 50 }], requires: 'workshop' },
];

export const TRADES: TradeDefinition[] = [
  { id: 'scales', name: '鳞片', type: 'good', cost: [{ resource: 'fur', amount: 150 }] },
  { id: 'teeth', name: '牙齿', type: 'good', cost: [{ resource: 'fur', amount: 300 }] },
  { id: 'iron', name: '铁', type: 'good', cost: [{ resource: 'fur', amount: 150 }, { resource: 'scales', amount: 50 }] },
  { id: 'coal', name: '煤', type: 'good', cost: [{ resource: 'fur', amount: 200 }, { resource: 'teeth', amount: 50 }] },
  { id: 'steel', name: '钢', type: 'good', cost: [{ resource: 'fur', amount: 300 }, { resource: 'scales', amount: 50 }, { resource: 'teeth', amount: 50 }] },
  { id: 'medicine', name: '药剂', type: 'good', cost: [{ resource: 'scales', amount: 50 }, { resource: 'teeth', amount: 30 }] },
  { id: 'bullets', name: '子弹', type: 'good', cost: [{ resource: 'scales', amount: 10 }] },
  { id: 'energyCell', name: '能量电池', type: 'good', cost: [{ resource: 'scales', amount: 10 }, { resource: 'teeth', amount: 10 }] },
  { id: 'bolas', name: '套索', type: 'weapon', cost: [{ resource: 'teeth', amount: 10 }] },
  { id: 'grenade', name: '手榴弹', type: 'weapon', cost: [{ resource: 'scales', amount: 100 }, { resource: 'teeth', amount: 50 }] },
  { id: 'bayonet', name: '刺刀', type: 'weapon', cost: [{ resource: 'scales', amount: 500 }, { resource: 'teeth', amount: 250 }] },
  { id: 'alienAlloy', name: '外星合金', type: 'good', cost: [{ resource: 'fur', amount: 1500 }, { resource: 'scales', amount: 750 }, { resource: 'teeth', amount: 300 }] },
  { id: 'compass', name: '罗盘', type: 'special', cost: [{ resource: 'fur', amount: 400 }, { resource: 'scales', amount: 20 }, { resource: 'teeth', amount: 10 }], max: 1 },
];

export const JOB_NAMES: Record<Job, string> = {
  gatherer: '采集者', hunter: '猎人', trapper: '陷阱师', tanner: '制革师', charcutier: '熏肉师',
  ironMiner: '铁矿工', coalMiner: '煤矿工', sulphurMiner: '硫磺矿工', steelworker: '炼钢工', armourer: '军械师',
};

export const JOB_PRODUCTION: Record<Job, Partial<Record<Resource, number>>> = {
  gatherer: { wood: 1 }, hunter: { fur: 0.5, meat: 0.5 }, trapper: { meat: -1, bait: 1 },
  tanner: { fur: -5, leather: 1 }, charcutier: { meat: -5, wood: -5, curedMeat: 1 },
  ironMiner: { curedMeat: -1, iron: 1 }, coalMiner: { curedMeat: -1, coal: 1 },
  sulphurMiner: { curedMeat: -1, sulphur: 1 }, steelworker: { iron: -1, coal: -1, steel: 1 },
  armourer: { steel: -1, sulphur: -1, bullets: 1 },
};
