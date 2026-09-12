import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { WORLD_TILE } from '../game/worldMap';

type AnyScene = ExpeditionScene & Record<string, any>;
type Loot = Record<string, number>;

type EnemyProfile = {
  name: string;
  hpMul: number;
  damageMul: number;
  trait: string;
};

const WEAPON_COOLDOWN: Record<string, number> = {
  boneSpear: 900,
  ironSword: 720,
  steelSword: 620,
  rifle: 1050,
  unarmed: 1100,
};

const LOOT_WEIGHT: Record<string, number> = {
  wood: 0.25,
  fur: 0.35,
  meat: 0.5,
  leather: 0.5,
  curedMeat: 0.5,
  iron: 0.8,
  coal: 0.7,
  sulphur: 0.7,
  steel: 1,
  medicine: 1,
  scales: 0.4,
  teeth: 0.25,
  cloth: 0.25,
  bullets: 0.05,
};

function profileFor(tile: string): EnemyProfile {
  if (tile === WORLD_TILE.house) return { name: '拾荒者', hpMul: 0.85, damageMul: 0.8, trait: '动作谨慎，威胁较低' };
  if (tile === WORLD_TILE.cave) return { name: '洞穴野兽', hpMul: 1.05, damageMul: 1.15, trait: '攻击凶猛' };
  if (tile === WORLD_TILE.ironMine) return { name: '矿坑守卫', hpMul: 1.1, damageMul: 1, trait: '生命较高' };
  if (tile === WORLD_TILE.coalMine) return { name: '矿坑掠夺者', hpMul: 1.05, damageMul: 1.1, trait: '攻击较强' };
  if (tile === WORLD_TILE.sulphurMine) return { name: '硫磺矿兽', hpMul: 1.2, damageMul: 1.15, trait: '危险且耐打' };
  if (tile === WORLD_TILE.town) return { name: '武装流民', hpMul: 1.2, damageMul: 1.2, trait: '攻守均衡' };
  if (tile === WORLD_TILE.city) return { name: '城市卫兵', hpMul: 1.45, damageMul: 1.35, trait: '重装且危险' };
  if (tile === WORLD_TILE.battlefield) return { name: '战场猎手', hpMul: 1.35, damageMul: 1.5, trait: '伤害很高' };
  return { name: '荒野敌人', hpMul: 1, damageMul: 1, trait: '未知威胁' };
}

function weaponId(scene: AnyScene): string {
  return String(scene.gear?.weapon ?? 'unarmed');
}

function cooldownMs(scene: AnyScene): number {
  return WEAPON_COOLDOWN[weaponId(scene)] ?? WEAPON_COOLDOWN.unarmed;
}

function lootWeight(scene: AnyScene): number {
  const carried = Object.entries(scene.carriedLoot ?? {}).reduce((sum, [key, amount]) => sum + (LOOT_WEIGHT[key] ?? 0.5) * Number(amount || 0), 0);
  const supplies = Number(scene.supplies?.curedMeat ?? 0) * 0.5 + Number(scene.supplies?.medicine ?? 0) + Number(scene.supplies?.bullets ?? 0) * 0.05;
  return Math.round((carried + supplies) * 10) / 10;
}

function remainingCapacity(scene: AnyScene): number {
  return Math.max(0, Number(scene.capacity ?? 8) - lootWeight(scene));
}

function addLootWithinCapacity(scene: AnyScene, loot: Loot): { taken: Loot; dropped: Loot } {
  const taken: Loot = {};
  const dropped: Loot = {};
  let room = remainingCapacity(scene);
  for (const [key, raw] of Object.entries(loot)) {
    const amount = Math.max(0, Math.floor(raw));
    const unit = LOOT_WEIGHT[key] ?? 0.5;
    const canTake = unit <= 0 ? amount : Math.min(amount, Math.floor((room + 1e-6) / unit));
    if (canTake > 0) {
      taken[key] = canTake;
      scene.carriedLoot[key] = Number(scene.carriedLoot[key] ?? 0) + canTake;
      room -= canTake * unit;
    }
    if (canTake < amount) dropped[key] = amount - canTake;
  }
  return { taken, dropped };
}

function describeLoot(scene: AnyScene, loot: Loot): string {
  return Object.entries(loot).map(([key, amount]) => `${scene.lootName(key)} +${amount}`).join(' · ');
}

export function installExpeditionCombatDepthPatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__combatDepthPatched) return;
  proto.__combatDepthPatched = true;

  const originalStartEncounter = proto.startEncounter;
  const originalRefreshEncounter = proto.refreshEncounter;
  const originalRefreshHud = proto.refreshHud;

  proto.startEncounter = function patchedStartEncounter(this: AnyScene, key: string, tile: string, name: string, danger: number) {
    originalStartEncounter.call(this, key, tile, name, danger);
    if (!this.encounter) return;
    const profile = profileFor(tile);
    this.encounter.enemyName = profile.name;
    this.encounter.trait = profile.trait;
    this.encounter.maxHp = Math.max(4, Math.round(this.encounter.maxHp * profile.hpMul));
    this.encounter.hp = this.encounter.maxHp;
    this.encounter.enemyDamage = Math.max(1, Math.round(this.encounter.enemyDamage * profile.damageMul));
    this.nextAttackAt = 0;
    this.refreshEncounter();
  };

  proto.refreshEncounter = function patchedRefreshEncounter(this: AnyScene) {
    originalRefreshEncounter.call(this);
    if (!this.encounter) return;
    const e = this.encounter;
    const remaining = Math.max(0, Math.ceil((Number(this.nextAttackAt ?? 0) - this.time.now) / 100) / 10);
    const base = this.encounterText?.text ?? '';
    this.encounterTitle?.setText(`${e.name} · ${e.enemyName ?? '敌人'}`);
    this.encounterText?.setText(
      `${base}\n敌人特性：${e.trait ?? '普通'}\n` +
      `武器节奏：${cooldownMs(this)}ms${remaining > 0 ? ` · 冷却 ${remaining.toFixed(1)}s` : ' · 可攻击'}`,
    );
  };

  proto.attackEnemy = function patchedAttackEnemy(this: AnyScene) {
    if (!this.encounter) return;
    const now = this.time.now;
    if (now < Number(this.nextAttackAt ?? 0)) {
      const left = Math.ceil((Number(this.nextAttackAt) - now) / 100) / 10;
      this.setMessage(`武器还在冷却，${left.toFixed(1)} 秒后可再次攻击。`);
      this.refreshEncounter();
      return;
    }
    if (weaponId(this) === 'rifle') {
      if (Number(this.supplies?.bullets ?? 0) <= 0) {
        this.setMessage('没有子弹，无法开火。');
        return;
      }
      this.supplies.bullets -= 1;
    }

    this.nextAttackAt = now + cooldownMs(this);
    this.encounter.hp = Math.max(0, Number(this.encounter.hp) - Number(this.attack ?? 1));
    if (this.encounter.hp <= 0) {
      this.winEncounter();
      return;
    }

    let enemyDamage = Math.max(1, Number(this.encounter.enemyDamage ?? 1));
    if (this.encounter.enemyName === '洞穴野兽' && Phaser.Math.Between(1, 100) <= 25) enemyDamage += 1;
    if (this.encounter.enemyName === '战场猎手' && Phaser.Math.Between(1, 100) <= 20) enemyDamage *= 2;
    this.hp = Math.max(0, Number(this.hp ?? 0) - enemyDamage);
    if (this.hp <= 0) {
      this.dieInWilderness();
      return;
    }
    this.refreshEncounter();
    this.refreshHud();
    this.time.delayedCall(cooldownMs(this), () => {
      if (this.encounter) this.refreshEncounter();
    });
  };

  proto.winEncounter = function patchedWinEncounter(this: AnyScene) {
    if (!this.encounter) return;
    const e = this.encounter;
    const loot = this.generateLoot(e.tile, e.danger) as Loot;
    const result = addLootWithinCapacity(this, loot);
    const cleared = (globalThis as any).__xiaohwExpeditionCleared as Set<string> | undefined;
    // Preserve the scene's own persistent clearing by calling through its public state effects manually.
    const mineTiles: string[] = [WORLD_TILE.ironMine, WORLD_TILE.coalMine, WORLD_TILE.sulphurMine];
    const persistentCleared = (ExpeditionScene as any).__persistentCleared as Set<string> | undefined;
    void cleared; void persistentCleared;

    // Reuse original persistence through the same sets indirectly: mark the encounter as defeated, then let a compact local copy finish it.
    const sceneModuleState = this as AnyScene;
    const key = e.key;
    const tile = e.tile;
    // The original scene reads these global module sets in render/inspect. Expose a helper state on the instance too.
    if (!sceneModuleState.__clearedKeys) sceneModuleState.__clearedKeys = new Set<string>();
    sceneModuleState.__clearedKeys.add(key);

    // Call original win persistence with loot temporarily suppressed, then restore our capacity-limited loot.
    const before = { ...(this.carriedLoot ?? {}) };
    for (const [k, v] of Object.entries(result.taken)) this.carriedLoot[k] = Math.max(0, Number(this.carriedLoot[k] ?? 0) - v);
    const originalGenerateLoot = this.generateLoot;
    this.generateLoot = () => ({});
    const originalWin = proto.__originalWinEncounter as ((this: AnyScene) => void) | undefined;
    if (originalWin) originalWin.call(this);
    this.generateLoot = originalGenerateLoot;
    this.carriedLoot = before;

    const takenText = describeLoot(this, result.taken) || '没有可携带的物资';
    const droppedText = describeLoot(this, result.dropped);
    this.setMessage(
      `已清理 ${e.name}。带走：${takenText}` +
      `${droppedText ? `\n因负重不足留下：${droppedText}` : ''}` +
      `${mineTiles.includes(tile) ? '\n矿场已占领。' : ''}`,
    );
    this.refreshHud();
  };

  proto.__originalWinEncounter = proto.winEncounter;

  proto.refreshHud = function patchedRefreshHud(this: AnyScene) {
    originalRefreshHud.call(this);
    const base = this.hudText?.text ?? '';
    this.hudText?.setText(`${base}    负重 ${lootWeight(this).toFixed(1)}/${Number(this.capacity ?? 8)}`);
  };
}
