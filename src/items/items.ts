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
const ITEM_TILES = ['item_stick', 'item_apple', 'item_coal', 'item_iron'];
ITEMS.set(Item.STICK, { id: Item.STICK, name: 'Stick', maxStack: MAX_STACK, tile: 'item_stick' });
ITEMS.set(Item.APPLE, { id: Item.APPLE, name: 'Apple', maxStack: MAX_STACK, tile: 'item_apple', food: 4 });
ITEMS.set(Item.COAL, { id: Item.COAL, name: 'Coal', maxStack: MAX_STACK, tile: 'item_coal' });
ITEMS.set(Item.IRON_INGOT, { id: Item.IRON_INGOT, name: 'Iron Ingot', maxStack: MAX_STACK, tile: 'item_iron' });
ITEMS.set(Item.WOODEN_PICKAXE, { id: Item.WOODEN_PICKAXE, name: 'Wooden Pickaxe', maxStack: 1, tile: 'item_stick', tool: { kind: 'pickaxe', level: 1, speed: 2 } });
ITEMS.set(Item.STONE_PICKAXE, { id: Item.STONE_PICKAXE, name: 'Stone Pickaxe', maxStack: 1, tile: 'cobblestone', tool: { kind: 'pickaxe', level: 2, speed: 4 } });
ITEMS.set(Item.WOODEN_AXE, { id: Item.WOODEN_AXE, name: 'Wooden Axe', maxStack: 1, tile: 'planks', tool: { kind: 'axe', level: 1, speed: 2 } });
ITEMS.set(Item.WOODEN_SHOVEL, { id: Item.WOODEN_SHOVEL, name: 'Wooden Shovel', maxStack: 1, tile: 'dirt', tool: { kind: 'shovel', level: 1, speed: 2 } });

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
    case Block.OAK_LEAVES: return null; // handled separately (chance-based)
    case Block.BEDROCK: case Block.WATER: case Block.AIR: return null;
    default: {
      const d = blockDef(blockId).drop ?? blockId;
      return { id: d, count: 1 };
    }
  }
}
