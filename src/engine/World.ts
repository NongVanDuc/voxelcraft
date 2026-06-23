import * as THREE from 'three';
import { Chunk } from './Chunk';
import { TerrainGenerator } from './TerrainGenerator';
import { buildChunkMesh } from './ChunkMesher';
import { TextureAtlas } from '../textures/TextureAtlas';
import { Block } from '../blocks/blockTypes';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, chunkKey, blockIndex } from './constants';

export class World {
  readonly seed: number;
  readonly terrain: TerrainGenerator;
  private readonly scene: THREE.Scene;
  private readonly atlas: TextureAtlas;
  private readonly chunks = new Map<string, Chunk>();
  /** Persistent player edits, keyed by chunk → (localIndex → blockId). Survives unload. */
  private readonly editStore = new Map<string, Map<number, number>>();

  readonly opaqueMaterial: THREE.MeshBasicMaterial;
  readonly transparentMaterial: THREE.MeshBasicMaterial;

  /** Per-frame time budget (ms) for chunk generation + meshing. */
  private frameBudgetMs = 5;
  /** Cached ring offsets (dx,dz) sorted by distance, rebuilt when render distance changes. */
  private ringOffsets: { dx: number; dz: number }[] = [];
  private ringDistance = -1;

  constructor(scene: THREE.Scene, atlas: TextureAtlas, seed: number) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.terrain = new TerrainGenerator(seed);

    this.opaqueMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
    });
    this.transparentMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Dim materials for time-of-day (1 = full day, ~0.2 = night). */
  setDaylight(f: number): void {
    this.opaqueMaterial.color.setScalar(f);
    this.transparentMaterial.color.setScalar(f);
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  private getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
    }
    return c;
  }

  private ensureGenerated(chunk: Chunk): void {
    if (chunk.generated) return;
    this.terrain.generate(chunk);
    // re-apply any persisted edits for this chunk on top of fresh terrain
    const edits = this.editStore.get(chunkKey(chunk.cx, chunk.cz));
    if (edits) for (const [idx, id] of edits) chunk.blocks[idx] = id;
    chunk.generated = true;
    chunk.dirty = true;
  }

  private ensureGeneratedAt(cx: number, cz: number): void {
    this.ensureGenerated(this.getOrCreateChunk(cx, cz));
  }

  /** Generate a chunk's 4 neighbours (block data only) then mesh it once with correct borders. */
  private meshChunk(chunk: Chunk): void {
    this.ensureGeneratedAt(chunk.cx + 1, chunk.cz);
    this.ensureGeneratedAt(chunk.cx - 1, chunk.cz);
    this.ensureGeneratedAt(chunk.cx, chunk.cz + 1);
    this.ensureGeneratedAt(chunk.cx, chunk.cz - 1);
    this.remesh(chunk);
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_Y) return Block.AIR;
    const cx = Math.floor(wx / CHUNK_X);
    const cz = Math.floor(wz / CHUNK_Z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return Block.AIR;
    return chunk.get(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z);
  }

  setBlock(wx: number, wy: number, wz: number, id: number, asEdit = true): void {
    if (wy < 0 || wy >= CHUNK_Y) return;
    const cx = Math.floor(wx / CHUNK_X);
    const cz = Math.floor(wz / CHUNK_Z);
    const chunk = this.getOrCreateChunk(cx, cz);
    this.ensureGenerated(chunk);
    const lx = wx - cx * CHUNK_X;
    const lz = wz - cz * CHUNK_Z;
    if (asEdit) {
      chunk.setEdit(lx, wy, lz, id);
      const ck = chunkKey(cx, cz);
      let m = this.editStore.get(ck);
      if (!m) { m = new Map(); this.editStore.set(ck, m); }
      m.set(blockIndex(lx, wy, lz), id);
    } else {
      chunk.setRaw(lx, wy, lz, id);
    }
    chunk.dirty = true;

    // dirty neighbour chunk(s) when editing on a border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.getChunk(cx, cz);
    if (c && c.generated) c.dirty = true;
  }

  private remesh(chunk: Chunk): void {
    const result = buildChunkMesh(chunk, this.atlas, (x, y, z) => this.getBlock(x, y, z));
    chunk.disposeMeshes(this.scene);
    const ox = chunk.cx * CHUNK_X;
    const oz = chunk.cz * CHUNK_Z;
    if (result.opaque) {
      const mesh = new THREE.Mesh(result.opaque, this.opaqueMaterial);
      mesh.position.set(ox, 0, oz);
      mesh.frustumCulled = true;
      chunk.opaqueMesh = mesh;
      this.scene.add(mesh);
    }
    if (result.transparent) {
      const mesh = new THREE.Mesh(result.transparent, this.transparentMaterial);
      mesh.position.set(ox, 0, oz);
      mesh.renderOrder = 1;
      chunk.transparentMesh = mesh;
      this.scene.add(mesh);
    }
    chunk.dirty = false;
  }

  /** Force-generate + mesh a column immediately (used to settle player spawn). */
  forceLoad(cx: number, cz: number): void {
    const c = this.getOrCreateChunk(cx, cz);
    this.ensureGenerated(c);
    this.meshChunk(c);
  }

  /**
   * Stream chunks around (px,pz). Generates the nearest missing chunks and
   * meshes dirty ones within a per-frame budget, and unloads far chunks.
   */
  update(px: number, pz: number, renderDistance: number): void {
    const pcx = Math.floor(px / CHUNK_X);
    const pcz = Math.floor(pz / CHUNK_Z);
    this.rebuildRing(renderDistance);

    // Process nearest-first until the per-frame time budget is spent. This keeps
    // frame times bounded (no big meshing spikes) so FPS stays smooth while the
    // world streams in. Neighbours are generated before meshing → each chunk
    // meshes exactly once.
    const t0 = performance.now();
    let processed = 0;
    for (const { dx, dz } of this.ringOffsets) {
      const chunk = this.getOrCreateChunk(pcx + dx, pcz + dz);
      if (!chunk.generated) this.ensureGenerated(chunk);
      if (chunk.dirty) {
        // always do at least one, then stop once the time budget is spent
        if (processed > 0 && performance.now() - t0 > this.frameBudgetMs) break;
        this.meshChunk(chunk);
        processed++;
      }
    }

    // unload far chunks
    const maxKeep = (renderDistance + 2) * (renderDistance + 2);
    for (const [key, chunk] of this.chunks) {
      const d = (chunk.cx - pcx) ** 2 + (chunk.cz - pcz) ** 2;
      if (d > maxKeep) {
        chunk.disposeMeshes(this.scene);
        this.chunks.delete(key);
      }
    }
  }

  private rebuildRing(renderDistance: number): void {
    if (this.ringDistance === renderDistance) return;
    this.ringDistance = renderDistance;
    const offsets: { dx: number; dz: number }[] = [];
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        if (dx * dx + dz * dz <= renderDistance * renderDistance) offsets.push({ dx, dz });
      }
    }
    offsets.sort((a, b) => (a.dx * a.dx + a.dz * a.dz) - (b.dx * b.dx + b.dz * b.dz));
    this.ringOffsets = offsets;
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  /** Serialize all player edits for saving. */
  serializeEdits(): [string, [number, number][]][] {
    return [...this.editStore].map(([ck, m]) => [ck, [...m]]);
  }

  /** Load edits (call before chunks generate so they apply on first gen). */
  loadEdits(data: [string, [number, number][]][]): void {
    for (const [ck, entries] of data) this.editStore.set(ck, new Map(entries));
  }
}
