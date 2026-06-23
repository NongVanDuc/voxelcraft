// Procedurally paints original 16x16 pixel tiles (Minecraft-like) into one atlas
// canvas. No external assets. Deterministic: each tile is seeded by its name.

import { mulberry32, hashSeed } from '../util/PRNG';

export const TILE = 16;

interface RGB { r: number; g: number; b: number; a?: number; }

function vary(c: RGB, rand: () => number, amount: number): RGB {
  const d = (rand() - 0.5) * 2 * amount;
  return {
    r: clamp8(c.r + d),
    g: clamp8(c.g + d),
    b: clamp8(c.b + d),
    a: c.a,
  };
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

type Painter = (px: (x: number, y: number, c: RGB) => void, rand: () => number) => void;

const C = {
  grassTop: { r: 91, g: 138, b: 58 },
  grassTop2: { r: 78, g: 120, b: 48 },
  dirt: { r: 121, g: 85, b: 58 },
  dirt2: { r: 102, g: 70, b: 46 },
  stone: { r: 127, g: 127, b: 127 },
  stone2: { r: 105, g: 105, b: 105 },
  cobbleLight: { r: 140, g: 140, b: 140 },
  cobbleDark: { r: 80, g: 80, b: 80 },
  sand: { r: 219, g: 205, b: 152 },
  sand2: { r: 201, g: 186, b: 132 },
  water: { r: 51, g: 95, b: 205 },
  water2: { r: 64, g: 112, b: 222 },
  bark: { r: 95, g: 73, b: 43 },
  bark2: { r: 78, g: 59, b: 34 },
  logTop: { r: 176, g: 138, b: 80 },
  logTop2: { r: 150, g: 116, b: 66 },
  leaves: { r: 60, g: 110, b: 40 },
  leaves2: { r: 44, g: 86, b: 30 },
  planks: { r: 176, g: 138, b: 80 },
  planks2: { r: 150, g: 116, b: 66 },
  plankSeam: { r: 120, g: 92, b: 52 },
  coal: { r: 32, g: 32, b: 32 },
  iron: { r: 200, g: 160, b: 120 },
  bedrockL: { r: 90, g: 90, b: 90 },
  bedrockD: { r: 40, g: 40, b: 40 },
  gravel: { r: 130, g: 122, b: 112 },
  gravel2: { r: 96, g: 90, b: 84 },
  snow: { r: 245, g: 248, b: 255 },
  snow2: { r: 220, g: 226, b: 238 },
};

const painters: Record<string, Painter> = {
  air: (px) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, { r: 0, g: 0, b: 0, a: 0 }); },

  dirt: (px, r) => speckle(px, r, C.dirt, C.dirt2, 0.45, 18),
  stone: (px, r) => speckle(px, r, C.stone, C.stone2, 0.4, 14),
  sand: (px, r) => speckle(px, r, C.sand, C.sand2, 0.4, 12),
  gravel: (px, r) => speckle(px, r, C.gravel, C.gravel2, 0.5, 24),
  snow: (px, r) => speckle(px, r, C.snow, C.snow2, 0.3, 10),

  grass_top: (px, r) => speckle(px, r, C.grassTop, C.grassTop2, 0.5, 18),

  grass_side: (px, r) => {
    // dirt base
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, vary(r() < 0.45 ? C.dirt2 : C.dirt, r, 12));
    // grass overhang on top, jagged edge
    for (let x = 0; x < TILE; x++) {
      const depth = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      for (let y = 0; y < depth; y++) px(x, y, vary(r() < 0.5 ? C.grassTop : C.grassTop2, r, 16));
    }
  },

  snow_side: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, vary(r() < 0.45 ? C.dirt2 : C.dirt, r, 12));
    for (let x = 0; x < TILE; x++) {
      const depth = 4 + (r() < 0.5 ? 1 : 0);
      for (let y = 0; y < depth; y++) px(x, y, vary(C.snow, r, 8));
    }
  },

  cobblestone: (px, r) => {
    // mortar background
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, vary(C.cobbleDark, r, 10));
    // scatter rounded stones
    const stones = 7;
    for (let s = 0; s < stones; s++) {
      const sx = 1 + Math.floor(r() * 12);
      const sy = 1 + Math.floor(r() * 12);
      const w = 3 + Math.floor(r() * 3);
      const h = 3 + Math.floor(r() * 3);
      for (let y = sy; y < Math.min(TILE - 1, sy + h); y++)
        for (let x = sx; x < Math.min(TILE - 1, sx + w); x++)
          px(x, y, vary(r() < 0.3 ? C.stone2 : C.cobbleLight, r, 12));
    }
  },

  water: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const wave = Math.sin((x + y) * 0.6) > 0.6;
        px(x, y, vary(wave ? C.water2 : C.water, r, 8));
      }
  },

  log_side: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const streak = x % 4 === 0 || x % 7 === 0;
        px(x, y, vary(streak ? C.bark2 : C.bark, r, 10));
      }
  },

  log_top: (px, r) => {
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const ring = Math.floor(d) % 2 === 0;
        px(x, y, vary(ring ? C.logTop : C.logTop2, r, 10));
      }
  },

  leaves: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if (r() < 0.08) { px(x, y, { r: 0, g: 0, b: 0, a: 0 }); continue; } // holes
        px(x, y, vary(r() < 0.5 ? C.leaves : C.leaves2, r, 16));
      }
  },

  planks: (px, r) => {
    for (let y = 0; y < TILE; y++) {
      const seam = y % 4 === 0;
      for (let x = 0; x < TILE; x++) {
        if (seam) { px(x, y, vary(C.plankSeam, r, 6)); continue; }
        const grain = (x * 3 + y * 7) % 5 === 0;
        px(x, y, vary(grain ? C.planks2 : C.planks, r, 8));
      }
    }
    // vertical board joints offset per row band
    for (let y = 0; y < TILE; y++) {
      const band = Math.floor(y / 4);
      const joint = (band % 2 === 0) ? 7 : 11;
      if (y % 4 !== 0) px(joint, y, vary(C.plankSeam, r, 4));
    }
  },

  glass: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const border = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (border) { px(x, y, { r: 200, g: 222, b: 230, a: 220 }); continue; }
        // mostly transparent with a faint diagonal highlight
        const hi = x - y === 3 || x - y === 4;
        px(x, y, hi ? { r: 230, g: 245, b: 250, a: 90 } : { r: 210, g: 230, b: 240, a: 24 });
      }
  },

  coal_ore: (px, r) => {
    painters.stone(px, mulberry32(hashSeed('stone')));
    blobs(px, r, C.coal, 4, 3);
  },

  iron_ore: (px, r) => {
    painters.stone(px, mulberry32(hashSeed('stone')));
    blobs(px, r, C.iron, 4, 3);
  },

  bedrock: (px, r) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, vary(r() < 0.5 ? C.bedrockL : C.bedrockD, r, 16));
  },

  crafting_top: (px, r) => {
    painters.planks(px, mulberry32(hashSeed('planks')));
    for (let i = 0; i < TILE; i++) { px(i, 7, vary(C.plankSeam, r, 4)); px(i, 8, vary(C.plankSeam, r, 4)); px(7, i, vary(C.plankSeam, r, 4)); px(8, i, vary(C.plankSeam, r, 4)); }
    px(3, 3, { r: 60, g: 60, b: 60 }); px(4, 3, { r: 60, g: 60, b: 60 });
    px(11, 11, { r: 70, g: 70, b: 70 }); px(12, 12, { r: 70, g: 70, b: 70 });
  },
  crafting_side: (px, r) => {
    painters.planks(px, mulberry32(hashSeed('planks')));
    for (let x = 2; x < 7; x++) for (let y = 2; y < 7; y++) if ((x + y) % 2 === 0) px(x, y, vary(C.plankSeam, r, 6));
    for (let i = 9; i < 14; i++) { px(i, 10, vary(C.plankSeam, r, 4)); px(11, i, vary(C.plankSeam, r, 4)); }
  },

  tall_grass: (px, r) => {
    clear(px);
    for (let x = 2; x < 14; x++) {
      if (r() < 0.35) continue;
      const h = 5 + Math.floor(r() * 7);
      for (let y = 15; y >= 16 - h; y--) px(x, y, vary(r() < 0.5 ? C.grassTop : C.grassTop2, r, 22));
    }
  },
  flower_red: (px, r) => {
    clear(px);
    const stem = { r: 50, g: 120, b: 40 };
    for (let y = 7; y < 15; y++) px(8, y, vary(stem, r, 10));
    px(7, 11, vary(stem, r, 8)); px(9, 9, vary(stem, r, 8));
    const red = { r: 200, g: 40, b: 40 };
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) px(8 + dx, 4 + dy, vary(red, r, 18));
    px(8, 4, { r: 245, g: 205, b: 70 });
  },
  flower_yellow: (px, r) => {
    clear(px);
    const stem = { r: 50, g: 120, b: 40 };
    for (let y = 8; y < 15; y++) px(8, y, vary(stem, r, 10));
    px(7, 11, vary(stem, r, 8));
    const yel = { r: 240, g: 210, b: 40 };
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) px(8 + dx, 5 + dy, vary(yel, r, 16));
    px(8, 5, { r: 180, g: 120, b: 30 });
  },

  // --- item icons (transparent background) ---
  item_stick: (px, r) => {
    clear(px);
    for (let i = 0; i < 10; i++) {
      const x = 5 + Math.floor(i * 0.55);
      const y = 13 - i;
      px(x, y, vary({ r: 130, g: 95, b: 55 }, r, 10));
      px(x + 1, y, vary({ r: 100, g: 72, b: 42 }, r, 10));
    }
  },
  item_apple: (px, r) => {
    clear(px);
    const cx = 8, cy = 9, rad = 5;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if ((x - cx) ** 2 + ((y - cy) * 1.1) ** 2 <= rad * rad) {
          const hi = x < cx && y < cy;
          px(x, y, vary(hi ? { r: 230, g: 70, b: 60 } : { r: 190, g: 40, b: 40 }, r, 14));
        }
      }
    px(8, 3, { r: 90, g: 60, b: 30 });
    px(8, 2, { r: 90, g: 60, b: 30 });
    px(9, 2, vary({ r: 70, g: 140, b: 50 }, r, 10));
  },
  item_coal: (px, r) => {
    clear(px);
    for (let y = 4; y < 13; y++)
      for (let x = 3; x < 13; x++) {
        if ((x === 3 || x === 12) && (y === 4 || y === 12)) continue;
        px(x, y, vary({ r: 34, g: 34, b: 38 }, r, 18));
      }
  },
  item_iron: (px, r) => {
    clear(px);
    for (let y = 6; y < 11; y++)
      for (let x = 3; x < 13; x++) px(x, y, vary({ r: 210, g: 210, b: 215 }, r, 16));
    for (let x = 3; x < 13; x++) px(x, 6, { r: 235, g: 235, b: 240 });
  },

  item_pickaxe: (px, r) => {
    clear(px);
    const handle = { r: 130, g: 95, b: 55 };
    for (let i = 0; i < 9; i++) { const x = 7 + Math.floor(i * 0.4), y = 13 - i; px(x, y, vary(handle, r, 8)); px(x + 1, y, vary({ r: 100, g: 72, b: 42 }, r, 8)); }
    const head = { r: 185, g: 185, b: 192 };
    for (let x = 3; x <= 12; x++) px(x, 3, vary(head, r, 12));
    px(3, 4, head); px(12, 4, head); px(2, 4, head); px(13, 4, head); px(7, 4, head); px(8, 4, head);
  },
  item_axe: (px, r) => {
    clear(px);
    const handle = { r: 130, g: 95, b: 55 };
    for (let i = 0; i < 10; i++) { const x = 9 - Math.floor(i * 0.3), y = 14 - i; px(x, y, vary(handle, r, 8)); px(x + 1, y, vary({ r: 100, g: 72, b: 42 }, r, 8)); }
    const head = { r: 185, g: 185, b: 192 };
    for (let y = 2; y <= 7; y++) for (let x = 4; x <= 10 - Math.abs(y - 4); x++) px(x, y, vary(head, r, 10));
  },
  item_shovel: (px, r) => {
    clear(px);
    const handle = { r: 130, g: 95, b: 55 };
    for (let i = 0; i < 9; i++) { const y = 14 - i; px(8, y, vary(handle, r, 8)); px(9, y, vary({ r: 100, g: 72, b: 42 }, r, 8)); }
    const head = { r: 185, g: 185, b: 192 };
    for (let y = 2; y <= 5; y++) for (let x = 6; x <= 11; x++) px(x, y, vary(head, r, 10));
  },
  item_sword: (px, r) => {
    clear(px);
    const blade = { r: 205, g: 210, b: 220 };
    for (let i = 0; i < 9; i++) { const x = 5 + i, y = 11 - i; px(x, y, vary(blade, r, 8)); px(x - 1, y + 1, vary({ r: 150, g: 155, b: 165 }, r, 8)); }
    px(4, 12, { r: 120, g: 90, b: 50 }); px(3, 11, { r: 120, g: 90, b: 50 }); px(2, 13, { r: 120, g: 90, b: 50 });
    px(3, 13, { r: 90, g: 65, b: 40 }); px(2, 14, { r: 90, g: 65, b: 40 });
  },
};

function clear(px: (x: number, y: number, c: RGB) => void) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, { r: 0, g: 0, b: 0, a: 0 });
}

export const CRACK_TILES = ['crack_0', 'crack_1', 'crack_2', 'crack_3', 'crack_4'];

// Progressive destroy-stage cracks: black lines, more numerous each stage.
function drawCrack(px: (x: number, y: number, c: RGB) => void, rand: () => number, stage: number) {
  clear(px);
  const cracks = stage + 2;
  for (let k = 0; k < cracks; k++) {
    let x = 1 + Math.floor(rand() * 14);
    let y = 1 + Math.floor(rand() * 14);
    const steps = 5 + Math.floor(rand() * 6);
    for (let s = 0; s < steps; s++) {
      px(x, y, { r: 0, g: 0, b: 0, a: 200 });
      if (rand() < 0.5) x += rand() < 0.5 ? 1 : -1;
      else y += rand() < 0.5 ? 1 : -1;
      x = Math.max(0, Math.min(15, x));
      y = Math.max(0, Math.min(15, y));
    }
  }
}

CRACK_TILES.forEach((name, s) => {
  painters[name] = (px, r) => drawCrack(px, r, s);
});

function speckle(px: (x: number, y: number, c: RGB) => void, rand: () => number, a: RGB, b: RGB, mix: number, amount: number) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      px(x, y, vary(rand() < mix ? b : a, rand, amount));
}

function blobs(px: (x: number, y: number, c: RGB) => void, rand: () => number, color: RGB, count: number, size: number) {
  for (let i = 0; i < count; i++) {
    const bx = 1 + Math.floor(rand() * (TILE - size - 1));
    const by = 1 + Math.floor(rand() * (TILE - size - 1));
    const w = 1 + Math.floor(rand() * size);
    const h = 1 + Math.floor(rand() * size);
    for (let y = by; y < by + h; y++)
      for (let x = bx; x < bx + w; x++)
        if (rand() < 0.8) px(x, y, vary(color, rand, 12));
  }
}

export interface AtlasData {
  canvas: HTMLCanvasElement;
  tileIndex: Map<string, number>;
  tilesPerRow: number;
  pixelSize: number;
}

/** Paints all tiles for the given names into a square-ish atlas canvas. */
export function generateAtlas(names: string[]): AtlasData {
  const tilesPerRow = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / tilesPerRow);
  const canvas = document.createElement('canvas');
  canvas.width = tilesPerRow * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const tileIndex = new Map<string, number>();

  names.forEach((name, idx) => {
    const col = idx % tilesPerRow;
    const row = Math.floor(idx / tilesPerRow);
    const ox = col * TILE;
    const oy = row * TILE;
    tileIndex.set(name, idx);

    const img = ctx.createImageData(TILE, TILE);
    const put = (x: number, y: number, c: RGB) => {
      const i = (y * TILE + x) * 4;
      img.data[i] = c.r;
      img.data[i + 1] = c.g;
      img.data[i + 2] = c.b;
      img.data[i + 3] = c.a ?? 255;
    };
    const painter = painters[name] ?? painters.stone;
    painter(put, mulberry32(hashSeed(name)));
    ctx.putImageData(img, ox, oy);
  });

  return { canvas, tileIndex, tilesPerRow, pixelSize: canvas.width };
}
