import Phaser from 'phaser';

let installed = false;

/**
 * Compatibility patch for the remaining hard-coded shell/nav drawing in GameScene.
 * Keeps gameplay logic untouched while matching the original text-tab presentation:
 * normal = black text, selected = black text + underline, with vertical separators.
 */
export function installLegacyScenePatch(): void {
  if (installed) return;
  installed = true;

  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as any;
  const originalRectangle = factoryProto.rectangle;
  const originalText = factoryProto.text;
  let selectedTabX: number | null = null;
  const tabXs: number[] = [];

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
    const isSelectedNav = fillColor === 0x24272b && height === 88;
    const isNormalNav = fillColor === 0x15171a && height === 88;
    const isLegacyNav = isSelectedNav || isNormalNav;

    if (isLegacyNav) {
      if (!tabXs.includes(x)) tabXs.push(x);
      if (isSelectedNav) selectedTabX = x;
    }

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
      rect.setData('legacyTabSelected', isSelectedNav);

      // Original headerButton uses a 1px vertical separator before every tab except the first.
      if (tabXs.length > 1) {
        const separatorX = x - width / 2 - 14;
        originalRectangle.call(this, separatorX, y, 1, 34, 0x111111, 1);
      }

      // Selected state is represented by an underline, not a filled card.
      if (isSelectedNav) {
        originalRectangle.call(this, x, y + 24, Math.min(90, width * 0.36), 2, 0x111111, 1);
      }
    }
    return rect;
  };

  factoryProto.text = function patchedText(
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const value = Array.isArray(text) ? text.join('\n') : text;
    const isMainTab = y === 55 && ['房间', '村庄', '荒野', '星舰'].some(name => value === name || value.startsWith(`${name} ·`));
    if (isMainTab) {
      style = { ...(style || {}), color: '#111111' };
    }
    const obj = originalText.call(this, x, y, text, style) as Phaser.GameObjects.Text;
    if (isMainTab) {
      obj.setColor('#111111');
      obj.setAlpha(1);
      obj.setData('legacyTabSelected', selectedTabX !== null && Math.abs(x - selectedTabX) < 2);
    }
    return obj;
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
