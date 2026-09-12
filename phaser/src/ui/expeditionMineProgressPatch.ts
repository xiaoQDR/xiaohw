import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { WORLD_TILE } from '../game/worldMap';

type AnyExpedition = Phaser.Scene & Record<string, any>;
type MineType = 'iron' | 'coal' | 'sulphur';
type MineFlags = Record<MineType, boolean>;

function mineTypeFor(tile: string): MineType | null {
  if (tile === WORLD_TILE.ironMine) return 'iron';
  if (tile === WORLD_TILE.coalMine) return 'coal';
  if (tile === WORLD_TILE.sulphurMine) return 'sulphur';
  return null;
}

function flags(build: Phaser.Scene & Record<string, any>): MineFlags {
  if (!build.claimedMineTypes) build.claimedMineTypes = { iron: false, coal: false, sulphur: false } satisfies MineFlags;
  return build.claimedMineTypes as MineFlags;
}

export function installExpeditionMineProgressPatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__expeditionMineProgressPatched) return;
  proto.__expeditionMineProgressPatched = true;

  const originalWinEncounter = proto.winEncounter;
  proto.winEncounter = function patchedWinEncounter(this: AnyExpedition) {
    const encounter = this.encounter ? { ...this.encounter } : undefined;
    originalWinEncounter.call(this);
    if (!encounter) return;
    const type = mineTypeFor(String(encounter.tile ?? ''));
    if (!type) return;
    const build = this.scene.get('build') as Phaser.Scene & Record<string, any>;
    flags(build)[type] = true;
    build.showToast?.(`${type === 'iron' ? '铁矿' : type === 'coal' ? '煤矿' : '硫磺矿'}已纳入营地生产范围`);
  };
}
