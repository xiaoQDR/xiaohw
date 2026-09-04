import Phaser from 'phaser';

let installed = false;

/**
 * Compatibility patch for the remaining hard-coded shell/nav drawing in GameScene.
 * Main navigation matches the original header-button behavior:
 * - compact left-to-right text tabs (not equal-width columns)
 * - normal: black text
 * - selected: black text + underline
 * - locked: gray text
 * - 1px separators between tabs
 */
export function installLegacyScenePatch(): void {
  if (installed) return;
  installed = true;

  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as any;
  const originalRectangle = factoryProto.rectangle;
  const originalText = factoryProto.text;

  const navMeta = new Map<number, { compactX: number; selected: boolean; locked?: boolean }>();

  const getTabLayout = (x: number, width: number) => {
    const count = Phaser.Math.Clamp(Math.round(1080 / (width + 28)), 1, 4);
    const slot = 1080 / count;
    const index = Phaser.Math.Clamp(Math.round(x / slot - 0.5), 0, count - 1);
    return {
      index,
      compactX: 150 + index * 145,
    };
  };

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

    let drawX = x;
    let drawWidth = width;
    let drawHeight = height;
    let drawFill = fillColor;
    let drawAlpha = fillAlpha;

    if (isLegacyHeader) {
      drawFill = 0xffffff;
      drawAlpha = 0.001;
    }

    if (isLegacyNav) {
      const { index, compactX } = getTabLayout(x, width);
      drawX = compactX;
      drawWidth = 116;
      drawHeight = 62;
      drawFill = 0xffffff;
      drawAlpha = 0.001;
      navMeta.set(Math.round(x), { compactX, selected: isSelectedNav });

      const extras: Phaser.GameObjects.Rectangle[] = [];
      if (index > 0) {
        const separator = originalRectangle.call(this, compactX - 72, y, 1, 30, 0x111111, 1) as Phaser.GameObjects.Rectangle;
        separator.setData('legacyNavExtra', true);
        extras.push(separator);
      }
      if (isSelectedNav) {
        const underline = originalRectangle.call(this, compactX, y + 25, 66, 2, 0x111111, 1) as Phaser.GameObjects.Rectangle;
        underline.setData('legacyNavExtra', true);
        extras.push(underline);
      }

      const rect = originalRectangle.call(this, drawX, y, drawWidth, drawHeight, drawFill, drawAlpha) as Phaser.GameObjects.Rectangle;
      rect.setStrokeStyle(0);
      rect.setData('legacyTextTab', true);
      rect.setData('legacyTabExtras', extras);
      rect.setData('legacyTabSelected', isSelectedNav);
      return rect;
    }

    const rect = originalRectangle.call(this, drawX, y, drawWidth, drawHeight, drawFill, drawAlpha) as Phaser.GameObjects.Rectangle;
    if (isLegacyHeader) rect.setStrokeStyle(0);
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

    if (!isMainTab) {
      return originalText.call(this, x, y, text, style) as Phaser.GameObjects.Text;
    }

    const meta = navMeta.get(Math.round(x));
    const locked = value.includes('· 未知');
    const obj = originalText.call(
      this,
      meta?.compactX ?? x,
      y,
      text,
      { ...(style || {}), color: locked ? '#999999' : '#111111' },
    ) as Phaser.GameObjects.Text;

    obj.setColor(locked ? '#999999' : '#111111');
    obj.setAlpha(1);
    obj.setData('legacyTabSelected', meta?.selected === true);
    return obj;
  };

  // Extras (separator + underline) are created at the same local coordinates as the tab,
  // then inserted into the same nav container when GameScene adds the tab objects.
  const containerProto = Phaser.GameObjects.Container.prototype as any;
  const originalAdd = containerProto.add;
  containerProto.add = function patchedContainerAdd(this: Phaser.GameObjects.Container, child: any): Phaser.GameObjects.Container {
    const list = Array.isArray(child) ? [...child] : [child];
    const extras: Phaser.GameObjects.GameObject[] = [];
    for (const entry of list) {
      if (entry instanceof Phaser.GameObjects.Rectangle && entry.getData('legacyTextTab')) {
        const tabExtras = entry.getData('legacyTabExtras') as Phaser.GameObjects.GameObject[] | undefined;
        if (tabExtras?.length) extras.push(...tabExtras);
      }
    }
    return originalAdd.call(this, Array.isArray(child) ? [...list, ...extras] : extras.length ? [child, ...extras] : child);
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
