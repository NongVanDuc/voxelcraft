import { itemDef, MAX_STACK } from '../items/items';

export interface ItemStack { id: number; count: number; }

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 main

/** A flat slot array: 0..8 hotbar, 9..35 main storage. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;

  private maxStack(id: number): number {
    return itemDef(id)?.maxStack ?? MAX_STACK;
  }

  getSelected(): ItemStack | null {
    return this.slots[this.selected];
  }

  /** Add items, merging into existing stacks then empty slots. Returns leftover. */
  add(id: number, count: number): number {
    const max = this.maxStack(id);
    // merge into existing stacks
    for (let i = 0; i < INVENTORY_SIZE && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) {
        const space = max - s.count;
        const moved = Math.min(space, count);
        s.count += moved;
        count -= moved;
      }
    }
    // fill empty slots (hotbar first for convenience)
    for (let i = 0; i < INVENTORY_SIZE && count > 0; i++) {
      if (!this.slots[i]) {
        const moved = Math.min(max, count);
        this.slots[i] = { id, count: moved };
        count -= moved;
      }
    }
    return count;
  }

  /** Remove one item from a slot; clears the slot if it empties. */
  decrement(index: number, amount = 1): void {
    const s = this.slots[index];
    if (!s) return;
    s.count -= amount;
    if (s.count <= 0) this.slots[index] = null;
  }

  decrementSelected(amount = 1): void {
    this.decrement(this.selected, amount);
  }

  setSlot(index: number, stack: ItemStack | null): void {
    this.slots[index] = stack;
  }

  has(index: number): boolean {
    return this.slots[index] != null;
  }

  serialize(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { id: s.id, count: s.count } : null));
  }

  load(data: (ItemStack | null)[]): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) this.slots[i] = data[i] ? { ...data[i]! } : null;
  }
}
