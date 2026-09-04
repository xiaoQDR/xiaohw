import Phaser from 'phaser';

let installed = false;

/**
 * Temporary compatibility patch for legacy A Dark Room presentation.
 * It removes the remaining hard-coded dark shell/nav rectangles from GameScene
 * without touching gameplay logic. Once GameScene layout is fully ported this
 * can be folded back into the scene implementation.
 */
export function installLegacyScenePatch(): void {
  if (installed) return;
  installed = true;

  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as Phaser.GameObjects.GameObjectFactory & {
    rectangle: (...args: any[]) => Phaser.GameObjects.Rectangle;
  };
  const originalRectangle = factoryProto.rectangle;

  factoryProto.rectangle = function patchedRectangle(
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor?: number,
    fillAlpha?: number,
  ): Phaser.GameObjects.Rectangle {
    const isLegacyHeader = fillColor === 0x101214 && height === 148;
    const isLegacyNav = (fillColor === 0x24272b || fillColor === 0x15171a) && height === 88;

    const rect = originalRectangle.call(
      this,
      x,
      y,
      width,
      height,
      isLegacyHeader || isLegacyNav ? 0xffffff : fillColor,
      isLegacyHeader || isLegacyNav ? 0.001 : fillAlpha,
    );

    if (isLegacyHeader) {
      rect.setStrokeStyle(0);
    }

    if (isLegacyNav) {
      // Original tabs are text controls, not filled cards.
      rect.setStrokeStyle(0);
      rect.setData('legacyTextTab', true);
    }

    return rect;
  };

  const originalStroke = Phaser.GameObjects.Rectangle.prototype.setStrokeStyle;
  Phaser.GameObjects.Rectangle.prototype.setStrokeStyle = function patchedStrokeStyle(
    this: Phaser.GameObjects.Rectangle,
    lineWidth?: number,
    color?: number,
    alpha?: number,
  ): Phaser.GameObjects.Rectangle {
    if (this.getData('legacyTextTab')) {
      return originalStroke.call(this, 0, color, alpha);
    }
    return originalStroke.call(this, lineWidth, color, alpha);
  };
}
