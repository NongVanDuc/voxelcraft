import type { ItemStack } from '../inventory/Inventory';

const KEY = 'voxelcraft_save_v1';

export interface SaveData {
  version: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  time: number;
  inventory: (ItemStack | null)[];
  edits: [string, [number, number][]][];
}

export const WorldStore = {
  save(data: SaveData): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('VoxelCraft: save failed', e);
    }
  },

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  },

  clear(): void {
    localStorage.removeItem(KEY);
  },
};
