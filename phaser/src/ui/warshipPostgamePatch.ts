import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { getWorldTile, WORLD_TILE } from '../game/worldMap';

type AnyExpedition = Phaser.Scene & Record<string, any>;
type WarshipState = { stage: number };

const SAVE_KEY = 'xiaohw-warship-v1';
const DECKS = [
  { name: '受创战舰 · 工程甲板', danger: 26 },
  { name: '受创战舰 · 医疗甲板', danger: 28 },
  { name: '受创战舰 · 武装甲板', danger: 31 },
  { name: '受创战舰 · 指挥甲板', danger: 34 },
];

function loadState(): WarshipState {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { stage: 0 };
    const parsed = JSON.parse(raw) as Partial<WarshipState>;
    return { stage: Phaser.Math.Clamp(Math.floor(Number(parsed.stage) || 0), 0, DECKS.length) };
  } catch {
    return { stage: 0 };
  }
}
function saveState(state: WarshipState): void {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
let state = loadState();

function currentTile(scene: AnyExpedition): string | undefined {
  const map = scene.worldMap as string[][] | undefined;
  if (!map) return undefined;
  return getWorldTile(map, Number(scene.px ?? 0), Number(scene.py ?? 0));
}

export function installWarshipPostgamePatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__warshipPostgamePatched) return;
  proto.__warshipPostgamePatched = true;

  const originalInspect = proto.inspectCurrentTile;
  const originalWin = proto.winEncounter;

  proto.inspectCurrentTile = function patchedInspect(this: AnyExpedition) {
    if (currentTile(this) !== WORLD_TILE.executioner) return originalInspect.call(this);
    const build = this.scene.get('build') as Phaser.Scene & Record<string, any>;
    if (!build.starshipCompleted) {
      this.setMessage?.('受创战舰的舱门没有响应。先完成 Old Starship 的 SPACE 主线后再来。');
      return;
    }
    if (state.stage >= DECKS.length) {
      this.setMessage?.('受创战舰已经完全清理。制造机已被运回营地。');
      return;
    }
    if (this.encounter) return;
    const deck = DECKS[state.stage];
    this.startEncounter?.(`warship:${state.stage}`, WORLD_TILE.executioner, deck.name, deck.danger);
  };

  proto.winEncounter = function patchedWin(this: AnyExpedition) {
    const encounter = this.encounter ? { ...this.encounter } : undefined;
    const result = originalWin.call(this);
    if (!encounter || !String(encounter.key ?? '').startsWith('warship:')) return result;

    const expected = Number(String(encounter.key).split(':')[1]);
    if (expected !== state.stage) return result;
    state.stage = Math.min(DECKS.length, state.stage + 1);
    saveState(state);

    const build = this.scene.get('build') as Phaser.Scene & Record<string, any>;
    if (state.stage >= DECKS.length) {
      build.fabricatorUnlocked = true;
      build.saveGameNow?.call(build);
      this.setMessage?.('指挥甲板已清理。你回收了一台制造机，返回营地后将解锁新的特殊设施。');
    } else {
      this.setMessage?.(`甲板已清理。受创战舰内部还有 ${DECKS.length - state.stage} 个区域。离开后再次进入可继续推进。`);
    }
    return result;
  };
}
