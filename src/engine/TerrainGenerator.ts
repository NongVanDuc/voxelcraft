import { Chunk } from './Chunk';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, SEA_LEVEL } from './constants';
import { Block } from '../blocks/blockTypes';
import { SimplexNoise } from '../util/noise';
import { hash2, hash3 } from '../util/PRNG';

/** Deterministic terrain: heightmap → layered blocks, ores, caves, water, trees. */
export class TerrainGenerator {
  private readonly seed: number;
  private readonly height: SimplexNoise;
  private readonly cave: SimplexNoise;

  constructor(seed: number) {
    this.seed = seed;
    this.height = new SimplexNoise(seed);
    this.cave = new SimplexNoise((seed ^ 0x9e3779b9) >>> 0);
  }

  /** Surface (topmost solid) height for a world column. */
  heightAt(wx: number, wz: number): number {
    const base = SEA_LEVEL + 3;
    const continent = this.height.fbm2D(wx * 0.006, wz * 0.006, 4);
    const hills = this.height.fbm2D(wx * 0.025, wz * 0.025, 3);
    const detail = this.height.noise2D(wx * 0.08, wz * 0.08) * 1.5;
    const h = base + continent * 22 + hills * 7 + detail;
    return Math.max(6, Math.min(CHUNK_Y - 24, Math.floor(h)));
  }

  generate(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_X;
    const oz = chunk.cz * CHUNK_Z;

    for (let x = 0; x < CHUNK_X; x++) {
      for (let z = 0; z < CHUNK_Z; z++) {
        const wx = ox + x;
        const wz = oz + z;
        const top = this.heightAt(wx, wz);
        const underwater = top < SEA_LEVEL;

        for (let y = 0; y <= top; y++) {
          let id: number;
          if (y === 0) {
            id = Block.BEDROCK;
          } else if (y <= 3 && hash3(wx, y, wz, this.seed) < 0.55) {
            id = Block.BEDROCK;
          } else if (y === top) {
            if (underwater) id = Block.SAND;
            else if (top <= SEA_LEVEL + 1) id = Block.SAND; // beach
            else if (top > SEA_LEVEL + 32) id = Block.SNOW; // peaks
            else id = Block.GRASS;
          } else if (y >= top - 3) {
            id = underwater ? Block.SAND : Block.DIRT;
          } else {
            id = this.stoneOrOre(wx, y, wz);
          }

          // carve caves (not into the very top crust or bedrock floor)
          if (y > 2 && y < top - 1 && id !== Block.BEDROCK) {
            const c = this.cave.noise3D(wx * 0.05, y * 0.07, wz * 0.05);
            if (c > 0.62) id = Block.AIR;
          }

          chunk.setRaw(x, y, z, id);
        }

        // water fill from surface up to sea level
        if (top < SEA_LEVEL) {
          for (let y = top + 1; y <= SEA_LEVEL; y++) chunk.setRaw(x, y, z, Block.WATER);
        }
      }
    }

    this.stampTrees(chunk, ox, oz);
  }

  private stoneOrOre(wx: number, y: number, wz: number): number {
    const r = hash3(wx, y, wz, this.seed ^ 0x5151);
    if (y < 24 && r < 0.012) return Block.IRON_ORE;
    if (y < 52 && r < 0.03) return Block.COAL_ORE;
    if (r < 0.04) return Block.GRAVEL;
    return Block.STONE;
  }

  /** Stamp trees whose base sits in (or near) this chunk so canopies span seams. */
  private stampTrees(chunk: Chunk, ox: number, oz: number): void {
    const margin = 3;
    for (let x = -margin; x < CHUNK_X + margin; x++) {
      for (let z = -margin; z < CHUNK_Z + margin; z++) {
        const wx = ox + x;
        const wz = oz + z;
        if (hash2(wx, wz, this.seed ^ 0x7a7a) >= 0.018) continue; // ~1.8% density
        const top = this.heightAt(wx, wz);
        if (top <= SEA_LEVEL + 1 || top > SEA_LEVEL + 30) continue; // grassy band only
        this.placeTree(chunk, x, top, z, wx, wz);
      }
    }
  }

  private placeTree(chunk: Chunk, lx: number, baseY: number, lz: number, wx: number, wz: number): void {
    const trunk = 4 + Math.floor(hash2(wx, wz, this.seed ^ 0xbeef) * 3); // 4..6
    const topY = baseY + trunk;

    // leaf canopy (two wide rings + a cap)
    const stamp = (px: number, py: number, pz: number, id: number, overwrite: boolean) => {
      if (px < 0 || px >= CHUNK_X || pz < 0 || pz >= CHUNK_Z || py < 0 || py >= CHUNK_Y) return;
      const cur = chunk.get(px, py, pz);
      if (!overwrite && cur !== Block.AIR && cur !== Block.OAK_LEAVES) return;
      chunk.setRaw(px, py, pz, id);
    };

    for (let dy = -2; dy <= 1; dy++) {
      const yy = topY + dy;
      const radius = dy <= -1 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy > -2) continue; // round corners
          stamp(lx + dx, yy, lz + dz, Block.OAK_LEAVES, false);
        }
      }
    }
    // trunk last so it overrides leaves at the core
    for (let i = 0; i < trunk; i++) stamp(lx, baseY + 1 + i, lz, Block.OAK_LOG, true);
  }
}
