// Block registry. Each block has rendering + gameplay metadata.
// Texture names refer to tiles produced by the texture atlas generator.

export const enum Block {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  COBBLESTONE = 4,
  SAND = 5,
  WATER = 6,
  OAK_LOG = 7,
  OAK_LEAVES = 8,
  PLANKS = 9,
  GLASS = 10,
  COAL_ORE = 11,
  IRON_ORE = 12,
  BEDROCK = 13,
  GRAVEL = 14,
  SNOW = 15,
  CRAFTING_TABLE = 16,
  TALL_GRASS = 17,
  FLOWER_RED = 18,
  FLOWER_YELLOW = 19,
}

export interface BlockDef {
  id: Block;
  name: string;
  /** Tile names for each face. Order: [px, nx, py(top), ny(bottom), pz, nz]. */
  faces: [string, string, string, string, string, string];
  /** Blocks light + culls neighbour faces fully. */
  opaque: boolean;
  /** Player collides with it. */
  solid: boolean;
  /** Rendered in the transparent pass (water, glass). */
  transparent: boolean;
  /** Cull a face when the neighbour is the same block (glass/water sheets). */
  cullSame: boolean;
  /** Seconds to break by hand (×modifiers). 0 = instant, Infinity = unbreakable. */
  hardness: number;
  /** Item/block id dropped when broken (defaults to self). */
  drop?: Block;
  /** Light emitted (0..15), reserved for later. */
  light?: number;
  /** Rendered as two crossed quads (plants/flowers) instead of a cube. */
  cross?: boolean;
}

function uniform(name: string): [string, string, string, string, string, string] {
  return [name, name, name, name, name, name];
}

/** column block: distinct top/bottom + side (logs). faces order px,nx,py,ny,pz,nz */
function column(side: string, top: string, bottom = top): [string, string, string, string, string, string] {
  return [side, side, top, bottom, side, side];
}

export const BLOCKS: Record<number, BlockDef> = {
  [Block.AIR]: { id: Block.AIR, name: 'Air', faces: uniform('air'), opaque: false, solid: false, transparent: true, cullSame: true, hardness: 0 },
  [Block.GRASS]: { id: Block.GRASS, name: 'Grass Block', faces: column('grass_side', 'grass_top', 'dirt'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 0.6, drop: Block.DIRT },
  [Block.DIRT]: { id: Block.DIRT, name: 'Dirt', faces: uniform('dirt'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 0.5 },
  [Block.STONE]: { id: Block.STONE, name: 'Stone', faces: uniform('stone'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 1.5, drop: Block.COBBLESTONE },
  [Block.COBBLESTONE]: { id: Block.COBBLESTONE, name: 'Cobblestone', faces: uniform('cobblestone'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 2.0 },
  [Block.SAND]: { id: Block.SAND, name: 'Sand', faces: uniform('sand'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 0.5 },
  [Block.WATER]: { id: Block.WATER, name: 'Water', faces: uniform('water'), opaque: false, solid: false, transparent: true, cullSame: true, hardness: Infinity },
  [Block.OAK_LOG]: { id: Block.OAK_LOG, name: 'Oak Log', faces: column('log_side', 'log_top'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 1.0 },
  [Block.OAK_LEAVES]: { id: Block.OAK_LEAVES, name: 'Oak Leaves', faces: uniform('leaves'), opaque: false, solid: true, transparent: false, cullSame: false, hardness: 0.2 },
  [Block.PLANKS]: { id: Block.PLANKS, name: 'Oak Planks', faces: uniform('planks'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 1.0 },
  [Block.GLASS]: { id: Block.GLASS, name: 'Glass', faces: uniform('glass'), opaque: false, solid: true, transparent: true, cullSame: true, hardness: 0.3 },
  [Block.COAL_ORE]: { id: Block.COAL_ORE, name: 'Coal Ore', faces: uniform('coal_ore'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 3.0 },
  [Block.IRON_ORE]: { id: Block.IRON_ORE, name: 'Iron Ore', faces: uniform('iron_ore'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 3.0 },
  [Block.BEDROCK]: { id: Block.BEDROCK, name: 'Bedrock', faces: uniform('bedrock'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: Infinity },
  [Block.GRAVEL]: { id: Block.GRAVEL, name: 'Gravel', faces: uniform('gravel'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 0.6 },
  [Block.SNOW]: { id: Block.SNOW, name: 'Snow', faces: column('snow_side', 'snow', 'dirt'), opaque: true, solid: true, transparent: false, cullSame: false, hardness: 0.5 },
  [Block.CRAFTING_TABLE]: { id: Block.CRAFTING_TABLE, name: 'Crafting Table', faces: ['crafting_side', 'crafting_side', 'crafting_top', 'planks', 'crafting_side', 'crafting_side'], opaque: true, solid: true, transparent: false, cullSame: false, hardness: 2.5 },
  [Block.TALL_GRASS]: { id: Block.TALL_GRASS, name: 'Tall Grass', faces: uniform('tall_grass'), opaque: false, solid: false, transparent: false, cullSame: false, hardness: 0, cross: true },
  [Block.FLOWER_RED]: { id: Block.FLOWER_RED, name: 'Poppy', faces: uniform('flower_red'), opaque: false, solid: false, transparent: false, cullSame: false, hardness: 0, cross: true },
  [Block.FLOWER_YELLOW]: { id: Block.FLOWER_YELLOW, name: 'Dandelion', faces: uniform('flower_yellow'), opaque: false, solid: false, transparent: false, cullSame: false, hardness: 0, cross: true },
};

export function blockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[Block.AIR];
}

export function isSolid(id: number): boolean {
  return blockDef(id).solid;
}

export function isOpaque(id: number): boolean {
  return blockDef(id).opaque;
}

/** All tile names referenced by any block face — drives the atlas. */
export function allTileNames(): string[] {
  const set = new Set<string>();
  for (const id in BLOCKS) {
    if (Number(id) === Block.AIR) continue;
    for (const f of BLOCKS[id].faces) set.add(f);
  }
  return [...set];
}
