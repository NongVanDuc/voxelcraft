import { Block } from '../blocks/blockTypes';
import { Item } from '../items/items';

const P = Block.PLANKS;
const S = Item.STICK;
const C = Block.COBBLESTONE;

export interface Recipe {
  shapeless?: number[];
  pattern?: number[][]; // rows of item ids, 0 = empty (already trimmed)
  out: { id: number; count: number };
}

export const RECIPES: Recipe[] = [
  { shapeless: [Block.OAK_LOG], out: { id: Block.PLANKS, count: 4 } },
  { shapeless: [P, P], out: { id: Item.STICK, count: 4 } },
  { pattern: [[P, P], [P, P]], out: { id: Block.CRAFTING_TABLE, count: 1 } },
  { pattern: [[P, P, P], [0, S, 0], [0, S, 0]], out: { id: Item.WOODEN_PICKAXE, count: 1 } },
  { pattern: [[P, P], [P, S], [0, S]], out: { id: Item.WOODEN_AXE, count: 1 } },
  { pattern: [[P], [S], [S]], out: { id: Item.WOODEN_SHOVEL, count: 1 } },
  { pattern: [[C, C, C], [0, S, 0], [0, S, 0]], out: { id: Item.STONE_PICKAXE, count: 1 } },
];

interface Box { rows: number[][]; }

/** Trim a square grid to the bounding box of its non-empty cells. */
function trim(ids: number[], cols: number): Box | null {
  let minR = cols, maxR = -1, minC = cols, maxC = -1;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r * cols + c] !== 0) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null;
  const rows: number[][] = [];
  for (let r = minR; r <= maxR; r++) {
    const row: number[] = [];
    for (let c = minC; c <= maxC; c++) row.push(ids[r * cols + c]);
    rows.push(row);
  }
  return { rows };
}

function patternsEqual(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) if (a[r][c] !== b[r][c]) return false;
  }
  return true;
}

/** Match the crafting grid (row-major, cols×cols) against the recipe book. */
export function matchRecipe(ids: number[], cols: number): { id: number; count: number } | null {
  const present = ids.filter((x) => x !== 0);
  if (present.length === 0) return null;

  for (const recipe of RECIPES) {
    if (recipe.shapeless) {
      const a = [...present].sort((x, y) => x - y);
      const b = [...recipe.shapeless].sort((x, y) => x - y);
      if (a.length === b.length && a.every((v, i) => v === b[i])) return recipe.out;
    } else if (recipe.pattern) {
      const box = trim(ids, cols);
      if (box && patternsEqual(box.rows, recipe.pattern)) return recipe.out;
    }
  }
  return null;
}
