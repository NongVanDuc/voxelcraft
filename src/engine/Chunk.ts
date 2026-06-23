import * as THREE from 'three';
import { Block } from '../blocks/blockTypes';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, CHUNK_VOLUME, blockIndex } from './constants';

/**
 * A 16×128×16 column of voxels plus its render meshes.
 * Block ids live in a flat Uint8Array; meshes are rebuilt on demand.
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;

  /** True once terrain has been generated into `blocks`. */
  generated = false;
  /** Needs a mesh rebuild. */
  dirty = true;
  /** Highest non-air block in the chunk; the mesher skips above this. */
  maxNonAirY = 0;
  /** Player edits not yet folded into a save (local block index → id). */
  edits = new Map<number, number>();

  opaqueMesh: THREE.Mesh | null = null;
  transparentMesh: THREE.Mesh | null = null;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOLUME); // all AIR (0)
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < CHUNK_X && y >= 0 && y < CHUNK_Y && z >= 0 && z < CHUNK_Z;
  }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return Block.AIR;
    return this.blocks[blockIndex(x, y, z)];
  }

  /** Set without recording an edit (used during generation). */
  setRaw(x: number, y: number, z: number, id: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[blockIndex(x, y, z)] = id;
    if (id !== Block.AIR && y > this.maxNonAirY) this.maxNonAirY = y;
  }

  /** Set and record as a player edit (used for persistence). */
  setEdit(x: number, y: number, z: number, id: number): void {
    if (!this.inBounds(x, y, z)) return;
    const idx = blockIndex(x, y, z);
    this.blocks[idx] = id;
    this.edits.set(idx, id);
    if (id !== Block.AIR && y > this.maxNonAirY) this.maxNonAirY = y;
    this.dirty = true;
  }

  disposeMeshes(scene: THREE.Scene): void {
    for (const mesh of [this.opaqueMesh, this.transparentMesh]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.opaqueMesh = null;
    this.transparentMesh = null;
  }
}
