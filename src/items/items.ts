// Item registry. Block items reuse their Block id (0..255); non-block items
// (tools, food, materials) use ids >= ITEM_BASE.

import { Block, BLOCKS, blockDef } from '../blocks/blockTypes';

export const ITEM_BASE = 256;
export const MAX_STACK = 64;

export const enum Item {
  STICK = 256,
  APPLE = 257,
  COAL = 258,
  IRON_INGOT = 259,
  WOODEN_PICKAXE = 260,
  STONE_PICKAXE = 261,
  WOODEN_AXE = 262,
  WOODEN_SHOVEL = 263,
  STONE_AXE = 264,
  STONE_SHOVEL = 265,
  IRON_PICKAXE = 266,
  IRON_AXE = 267,
  IRON_SHOVEL = 268,
  WOODEN_SWORD = 269,
  STONE_SWORD = 270,
  IRON_SWORD = 271,
}

export type ToolKind = 'pickaxe' | 'axe' | 'shovel';

export interface ItemDef {
  id: number;
  name: string;
  maxStack: number;
  tile: string;
  /** Placeable block id, if this item is a block. */
  block?: number;
  /** Hunger restored when eaten. */
  food?: number;
  /** Tool metadata for mining-speed bonuses. */
  tool?: { kind: ToolKind; level: number; speed: number };
  /** Melee damage when held (swords). */
  attack?: number;
}

export const ITEMS = new Map<number, ItemDef>();

// Register every (placeable) block as an item.
for (const key in BLOCKS) {
  const id = Number(key);
  if (id === Block.AIR || id === Block.WATER) continue;
  const def = BLOCKS[id];
  ITEMS.set(id, { id, name: def.name, maxStack: MAX_STACK, tile: def.faces[0], block: id });
}

// Non-block items.
const ITEM_TILES = ['item_stick', 'item_apple', 'item_coal', 'item_iron', 'item_pickaxe', 'item_axe', 'item_shovel', 'item_sword'];
ITEMS.set(Item.STICK, { id: Item.STICK, name: 'Stick', maxStack: MAX_STACK, tile: 'item_stick' });
ITEMS.set(Item.APPLE, { id: Item.APPLE, name: 'Apple', maxStack: MAX_STACK, tile: 'item_apple', food: 4 });
ITEMS.set(Item.COAL, { id: Item.COAL, name: 'Coal', maxStack: MAX_STACK, tile: 'item_coal' });
ITEMS.set(Item.IRON_INGOT, { id: Item.IRON_INGOT, name: 'Iron Ingot', maxStack: MAX_STACK, tile: 'item_iron' });

const tool = (id: number, name: string, tile: string, kind: ToolKind, level: number, speed: number) =>
  ITEMS.set(id, { id, name, maxStack: 1, tile, tool: { kind, level, speed } });
const sword = (id: number, name: string, attack: number) =>
  ITEMS.set(id, { id, name, maxStack: 1, tile: 'item_sword', attack });

tool(Item.WOODEN_PICKAXE, 'Wooden Pickaxe', 'item_pickaxe', 'pickaxe', 1, 2);
tool(Item.STONE_PICKAXE, 'Stone Pickaxe', 'item_pickaxe', 'pickaxe', 2, 4);
tool(Item.IRON_PICKAXE, 'Iron Pickaxe', 'item_pickaxe', 'pickaxe', 3, 6);
tool(Item.WOODEN_AXE, 'Wooden Axe', 'item_axe', 'axe', 1, 2);
tool(Item.STONE_AXE, 'Stone Axe', 'item_axe', 'axe', 2, 4);
tool(Item.IRON_AXE, 'Iron Axe', 'item_axe', 'axe', 3, 6);
tool(Item.WOODEN_SHOVEL, 'Wooden Shovel', 'item_shovel', 'shovel', 1, 2);
tool(Item.STONE_SHOVEL, 'Stone Shovel', 'item_shovel', 'shovel', 2, 4);
tool(Item.IRON_SHOVEL, 'Iron Shovel', 'item_shovel', 'shovel', 3, 6);
sword(Item.WOODEN_SWORD, 'Wooden Sword', 5);
sword(Item.STONE_SWORD, 'Stone Sword', 6);
sword(Item.IRON_SWORD, 'Iron Sword', 7);

export function itemDef(id: number): ItemDef | undefined {
  return ITEMS.get(id);
}

export function itemTile(id: number): string {
  return ITEMS.get(id)?.tile ?? 'stone';
}

export function itemName(id: number): string {
  return ITEMS.get(id)?.name ?? 'Unknown';
}

export function allItemTiles(): string[] {
  return ITEM_TILES;
}

/** What a broken block yields. */
export function dropsFor(blockId: number): { id: number; count: number } | null {
  switch (blockId) {
    case Block.GRASS: return { id: Block.DIRT, count: 1 };
    case Block.STONE: return { id: Block.COBBLESTONE, count: 1 };
    case Block.COAL_ORE: return { id: Item.COAL, count: 1 };
    case Block.IRON_ORE: return { id: Item.IRON_INGOT, count: 1 };
    case Block.GLASS: return null; // shatters
    case Block.TALL_GRASS: return null; // grass yields nothing
    case Block.OAK_LEAVES: return null; // handled separately (chance-based)
    case Block.BEDROCK: case Block.WATER: case Block.AIR: return null;
    default: {
      const d = blockDef(blockId).drop ?? blockId;
      return { id: d, count: 1 };
    }
  }
}
