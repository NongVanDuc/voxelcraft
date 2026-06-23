import * as THREE from 'three';
import { Chunk } from './Chunk';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, blockIndex } from './constants';
import { Block, blockDef } from '../blocks/blockTypes';
import { TextureAtlas } from '../textures/TextureAtlas';

interface FaceDef {
  dir: [number, number, number];
  corners: [number, number, number][];
  uv: [number, number][];
  shade: number;
}

// Unit-cube faces, CCW from outside (Three.js front-facing). uv (0,0)=tile top-left.
const FACES: FaceDef[] = [
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.8 },   // +X
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.8 },  // -X
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 1.0 },   // +Y top
  { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.5 },  // -Y bottom
  { dir: [0, 0, 1], corners: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.7 },   // +Z
  { dir: [0, 0, -1], corners: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.7 },  // -Z
];

export interface MeshResult {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
}

type GetBlock = (wx: number, wy: number, wz: number) => number;

/** Should the face between `id` and its neighbour `nid` be emitted? */
function shouldDrawFace(id: number, nid: number): boolean {
  if (nid === Block.AIR) return true;
  const ndef = blockDef(nid);
  if (ndef.opaque) return false;
  if (nid === id && ndef.cullSame) return false;
  return true;
}

class GeoBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  private vcount = 0;

  addFace(face: FaceDef, bx: number, by: number, bz: number, tileUV: { u0: number; v0: number; u1: number; v1: number }) {
    const s = face.shade;
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      this.positions.push(bx + c[0], by + c[1], bz + c[2]);
      this.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      this.colors.push(s, s, s);
      const [uu, vv] = face.uv[i];
      this.uvs.push(
        tileUV.u0 + uu * (tileUV.u1 - tileUV.u0),
        tileUV.v0 + vv * (tileUV.v1 - tileUV.v0),
      );
    }
    const v = this.vcount;
    this.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.vcount += 4;
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

export function buildChunkMesh(chunk: Chunk, atlas: TextureAtlas, getBlock: GetBlock): MeshResult {
  const ox = chunk.cx * CHUNK_X;
  const oz = chunk.cz * CHUNK_Z;
  const opaque = new GeoBuilder();
  const transparent = new GeoBuilder();

  const maxY = Math.min(CHUNK_Y - 1, chunk.maxNonAirY);
  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      for (let x = 0; x < CHUNK_X; x++) {
        const id = chunk.blocks[blockIndex(x, y, z)];
        if (id === Block.AIR) continue;
        const def = blockDef(id);
        const builder = def.transparent ? transparent : opaque;
        const wx = ox + x;
        const wz = oz + z;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nid = getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          if (!shouldDrawFace(id, nid)) continue;
          const tileName = def.faces[f];
          builder.addFace(face, x, y, z, atlas.getTileUV(tileName));
        }
      }
    }
  }

  return { opaque: opaque.build(), transparent: transparent.build() };
}
