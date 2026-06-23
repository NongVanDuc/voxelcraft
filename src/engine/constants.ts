export const CHUNK_X = 16;
export const CHUNK_Z = 16;
export const CHUNK_Y = 128;
export const SEA_LEVEL = 40;

export const CHUNK_AREA = CHUNK_X * CHUNK_Z;
export const CHUNK_VOLUME = CHUNK_X * CHUNK_Z * CHUNK_Y;

/** Local block index inside a chunk. y-major for cache-friendly vertical scans. */
export function blockIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_Z + z) * CHUNK_X + x;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** World coord → chunk coord (floor division by chunk size). */
export function worldToChunk(wx: number, wz: number): { cx: number; cz: number } {
  return { cx: Math.floor(wx / CHUNK_X), cz: Math.floor(wz / CHUNK_Z) };
}
