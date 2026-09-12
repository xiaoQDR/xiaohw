import Phaser from 'phaser';
import { ExpeditionScene } from '../scenes/ExpeditionScene';
import { WORLD_RADIUS } from '../game/worldMap';

type AnyExpedition = Phaser.Scene & Record<string, any>;

export function installExpeditionMovementFixPatch(): void {
  const proto = ExpeditionScene.prototype as unknown as Record<string, any>;
  if (proto.__expeditionMovementFixPatched) return;
  proto.__expeditionMovementFixPatched = true;

  proto.tryMove = function fixedTryMove(this: AnyExpedition, dx: number, dy: number) {
    if (this.moving || this.encounter) return;
    if (Number(this.water ?? 0) <= 0) {
      this.setMessage?.('水已经耗尽，不能继续深入。返回营地。');
      return;
    }

    const nextStep = Number(this.steps ?? 0) + 1;
    const consumesFood = nextStep % 2 === 0;
    if (consumesFood && Number(this.supplies?.curedMeat ?? 0) <= 0) {
      this.setMessage?.('下一步需要消耗熏肉，但补给已经耗尽。');
      return;
    }

    const nx = Number(this.px ?? 0) + dx;
    const ny = Number(this.py ?? 0) + dy;
    if (Math.abs(nx) > WORLD_RADIUS || Math.abs(ny) > WORLD_RADIUS) {
      this.setMessage?.('这里已经是荒野边界。');
      return;
    }

    this.moving = true;
    this.px = nx;
    this.py = ny;
    this.steps = nextStep;
    this.water = Math.max(0, Number(this.water ?? 0) - 1);
    if (consumesFood && this.supplies) {
      this.supplies.curedMeat = Math.max(0, Number(this.supplies.curedMeat ?? 0) - 1);
    }
    this.revealAroundPlayer?.();
    this.renderMap?.();
    this.refreshHud?.();
    this.inspectCurrentTile?.();
    this.time.delayedCall(120, () => { this.moving = false; });
  };
}
