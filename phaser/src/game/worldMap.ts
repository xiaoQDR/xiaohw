export const WORLD_RADIUS = 30;

export const WORLD_TILE = {
  village: 'A', ironMine: 'I', coalMine: 'C', sulphurMine: 'S',
  forest: ';', field: ',', barrens: '.', house: 'H', cave: 'V',
  town: 'O', city: 'Y', ship: 'W', borehole: 'B', battlefield: 'F',
  swamp: 'M', executioner: 'X',
} as const;

export interface WorldLandmarkDefinition {
  tile: string;
  count: number;
  minRadius: number;
  maxRadius: number;
  name: string;
  danger: number;
}

export const WORLD_LANDMARKS: WorldLandmarkDefinition[] = [
  { tile: 'I', count: 1, minRadius: 5, maxRadius: 5, name: '铁矿', danger: 8 },
  { tile: 'C', count: 1, minRadius: 10, maxRadius: 10, name: '煤矿', danger: 12 },
  { tile: 'S', count: 1, minRadius: 20, maxRadius: 20, name: '硫磺矿', danger: 18 },
  { tile: 'H', count: 10, minRadius: 0, maxRadius: 45, name: '老旧房屋', danger: 6 },
  { tile: 'V', count: 5, minRadius: 3, maxRadius: 10, name: '潮湿洞穴', danger: 8 },
  { tile: 'O', count: 10, minRadius: 10, maxRadius: 20, name: '废弃城镇', danger: 14 },
  { tile: 'Y', count: 20, minRadius: 20, maxRadius: 45, name: '毁坏城市', danger: 22 },
  { tile: 'W', count: 1, minRadius: 28, maxRadius: 28, name: '坠毁星舰', danger: 28 },
  { tile: 'B', count: 10, minRadius: 15, maxRadius: 45, name: '钻井', danger: 18 },
  { tile: 'F', count: 5, minRadius: 18, maxRadius: 45, name: '战场', danger: 20 },
  { tile: 'M', count: 1, minRadius: 15, maxRadius: 45, name: '浑浊沼泽', danger: 24 },
  { tile: 'X', count: 1, minRadius: 28, maxRadius: 28, name: '受创战舰', danger: 32 },
];

const terrain = new Set<string>([WORLD_TILE.forest, WORLD_TILE.field, WORLD_TILE.barrens]);

function isTerrain(tile: string | undefined): boolean {
  return !!tile && terrain.has(tile);
}

function chooseTile(x: number, y: number, map: string[][]): string {
  const adjacent = [map[x]?.[y - 1], map[x]?.[y + 1], map[x + 1]?.[y], map[x - 1]?.[y]];
  const chances: Record<string, number> = {};
  let nonSticky = 1;
  for (const tile of adjacent) {
    if (tile === WORLD_TILE.village) return WORLD_TILE.forest;
    if (typeof tile === 'string') {
      chances[tile] = (chances[tile] ?? 0) + 0.5;
      nonSticky -= 0.5;
    }
  }
  const probabilities: Record<string, number> = { ';': 0.15, ',': 0.35, '.': 0.5 };
  for (const [tile, probability] of Object.entries(probabilities)) {
    chances[tile] = (chances[tile] ?? 0) + probability * nonSticky;
  }
  const weighted = Object.entries(chances).sort((a, b) => b[1] - a[1]);
  const roll = Math.random();
  let cursor = 0;
  for (const [tile, chance] of weighted) {
    cursor += chance;
    if (roll < cursor) return tile;
  }
  return WORLD_TILE.barrens;
}

function placeLandmark(definition: WorldLandmarkDefinition, map: string[][]): void {
  let x = WORLD_RADIUS;
  let y = WORLD_RADIUS;
  do {
    const radius = Math.floor(Math.random() * (definition.maxRadius - definition.minRadius)) + definition.minRadius;
    let xDistance = Math.floor(Math.random() * Math.max(1, radius));
    let yDistance = radius - xDistance;
    if (Math.random() < 0.5) xDistance *= -1;
    if (Math.random() < 0.5) yDistance *= -1;
    x = Math.max(0, Math.min(WORLD_RADIUS * 2, WORLD_RADIUS + xDistance));
    y = Math.max(0, Math.min(WORLD_RADIUS * 2, WORLD_RADIUS + yDistance));
  } while (!isTerrain(map[x][y]));
  map[x][y] = definition.tile;
}

export function generateWorldMap(): string[][] {
  const size = WORLD_RADIUS * 2 + 1;
  const map = Array.from({ length: size }, () => Array<string>(size));
  map[WORLD_RADIUS][WORLD_RADIUS] = WORLD_TILE.village;
  for (let radius = 1; radius <= WORLD_RADIUS; radius += 1) {
    for (let turn = 0; turn < radius * 8; turn += 1) {
      let x: number;
      let y: number;
      if (turn < 2 * radius) {
        x = WORLD_RADIUS - radius + turn; y = WORLD_RADIUS - radius;
      } else if (turn < 4 * radius) {
        x = WORLD_RADIUS + radius; y = WORLD_RADIUS - 3 * radius + turn;
      } else if (turn < 6 * radius) {
        x = WORLD_RADIUS + 5 * radius - turn; y = WORLD_RADIUS + radius;
      } else {
        x = WORLD_RADIUS - radius; y = WORLD_RADIUS + 7 * radius - turn;
      }
      map[x][y] = chooseTile(x, y, map);
    }
  }
  for (const landmark of WORLD_LANDMARKS) {
    for (let index = 0; index < landmark.count; index += 1) placeLandmark(landmark, map);
  }
  return map;
}

export function getWorldTile(map: string[][], x: number, y: number): string | undefined {
  return map[x + WORLD_RADIUS]?.[y + WORLD_RADIUS];
}

export function getLandmark(tile: string | undefined): WorldLandmarkDefinition | undefined {
  return WORLD_LANDMARKS.find(item => item.tile === tile);
}
