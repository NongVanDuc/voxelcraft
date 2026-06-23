import * as THREE from 'three';
import { World } from './World';
import { isSolid } from '../blocks/blockTypes';

export interface RayHit {
  /** Block that was hit. */
  bx: number; by: number; bz: number;
  /** Adjacent empty cell against the hit face (where a new block would go). */
  px: number; py: number; pz: number;
  /** Face normal. */
  nx: number; ny: number; nz: number;
}

/**
 * Amanatides & Woo voxel traversal. Returns the first solid block the ray
 * enters within `maxDist`, plus the empty neighbour for placement.
 */
export function raycastVoxel(world: World, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const boundary = (s: number, o: number, b: number) =>
    s > 0 ? (b + 1 - o) : (o - b);

  let tMaxX = dir.x !== 0 ? boundary(stepX, origin.x, x) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? boundary(stepY, origin.y, y) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? boundary(stepZ, origin.z, z) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && isSolid(id)) {
      return { bx: x, by: y, bz: z, px: x + nx, py: y + ny, pz: z + nz, nx, ny, nz };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
