import Phaser from 'phaser';

let installed = false;

/**
 * Compatibility patch for the remaining hard-coded dark shell/nav rectangles
 * in GameScene. Keeps gameplay untouched while matching the original game's
 * white page + text-tab presentation.
 */
export function installLegacyScenePatch(): void {
  if (installed) return;
  installed = true;

  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as any;
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
    ) as Phaser.GameObjects.Rectangle;

    if (isLegacyHeader) rect.setStrokeStyle(0);
    if (isLegacyNav) {
      rect.setStrokeStyle(0);
      rect.setData('legacyTextTab', true);
    }
    return rect;
  };

  const rectangleProto = Phaser.GameObjects.Rectangle.prototype as any;
  const originalStroke = rectangleProto.setStrokeStyle;
  rectangleProto.setStrokeStyle = function patchedStrokeStyle(
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
