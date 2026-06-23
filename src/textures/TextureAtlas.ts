import * as THREE from 'three';
import { generateAtlas, CRACK_TILES, type AtlasData } from './generateTextures';
import { allTileNames } from '../blocks/blockTypes';
import { allItemTiles } from '../items/items';

export interface TileUV { u0: number; v0: number; u1: number; v1: number; }

/**
 * Builds the procedural texture atlas and exposes a Three.js texture plus
 * per-tile UV rectangles. Uses nearest filtering for crisp pixel art.
 */
export class TextureAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly data: AtlasData;
  private readonly uvCache = new Map<string, TileUV>();
  private readonly pad: number;

  constructor() {
    const names = [...allTileNames(), ...allItemTiles(), ...CRACK_TILES];
    this.data = generateAtlas(names);

    const tex = new THREE.CanvasTexture(this.data.canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;

    // tiny inset (0.1 texel) to avoid sampling neighbouring tiles at edges
    this.pad = 0.1 / this.data.canvas.width;
  }

  /** The raw atlas canvas (used by the HUD to crop block icons). */
  get canvas(): HTMLCanvasElement {
    return this.data.canvas;
  }

  /** Pixel rect of a named tile within the atlas canvas. */
  getTilePixelRect(name: string): { x: number; y: number; size: number } {
    const idx = this.data.tileIndex.get(name) ?? 0;
    const cols = this.data.tilesPerRow;
    return { x: (idx % cols) * 16, y: Math.floor(idx / cols) * 16, size: 16 };
  }

  /** UV rect for a named tile, in flipY=false space (v0=top, v1=bottom). */
  getTileUV(name: string): TileUV {
    const cached = this.uvCache.get(name);
    if (cached) return cached;

    const idx = this.data.tileIndex.get(name) ?? 0;
    const cols = this.data.tilesPerRow;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const w = this.data.canvas.width;
    const h = this.data.canvas.height;
    const tile = 16;

    const uv: TileUV = {
      u0: (col * tile) / w + this.pad,
      v0: (row * tile) / h + this.pad,
      u1: ((col + 1) * tile) / w - this.pad,
      v1: ((row + 1) * tile) / h - this.pad,
    };
    this.uvCache.set(name, uv);
    return uv;
  }
}
