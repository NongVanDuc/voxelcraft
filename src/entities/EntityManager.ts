import * as THREE from 'three';
import { World } from '../engine/World';
import { TextureAtlas } from '../textures/TextureAtlas';
import { Inventory } from '../inventory/Inventory';
import { itemTile } from '../items/items';
import { isSolid } from '../blocks/blockTypes';

interface ItemEntity {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  id: number;
  count: number;
  age: number;
  mesh: THREE.Mesh;
}

const GEO = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const GRAVITY = 18;

/** Manages dropped item pickups (and is the home for future mobs). */
export class EntityManager {
  private scene: THREE.Scene;
  private atlas: TextureAtlas;
  private items: ItemEntity[] = [];
  private matCache = new Map<number, THREE.Material>();

  constructor(scene: THREE.Scene, atlas: TextureAtlas) {
    this.scene = scene;
    this.atlas = atlas;
  }

  private material(id: number): THREE.Material {
    let m = this.matCache.get(id);
    if (m) return m;
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rect = this.atlas.getTilePixelRect(itemTile(id));
    ctx.drawImage(this.atlas.canvas, rect.x, rect.y, 16, 16, 0, 0, 16, 16);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3 });
    this.matCache.set(id, m);
    return m;
  }

  spawn(x: number, y: number, z: number, id: number, count: number): void {
    const mesh = new THREE.Mesh(GEO, this.material(id));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 2, (Math.random() - 0.5) * 1.5);
    this.items.push({ pos: mesh.position, vel, id, count, age: 0, mesh });
  }

  clear(): void {
    for (const e of this.items) this.scene.remove(e.mesh);
    this.items = [];
  }

  update(dt: number, world: World, playerPos: THREE.Vector3, inventory: Inventory, onPickup: (id: number, count: number) => void): void {
    const center = new THREE.Vector3(playerPos.x, playerPos.y + 0.9, playerPos.z);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.age += dt;

      // physics
      e.vel.y -= GRAVITY * dt;
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.pos.z += e.vel.z * dt;
      e.vel.x *= 0.86; e.vel.z *= 0.86;

      // rest on ground
      const below = world.getBlock(Math.floor(e.pos.x), Math.floor(e.pos.y - 0.15), Math.floor(e.pos.z));
      if (isSolid(below) && e.vel.y < 0) {
        e.pos.y = Math.floor(e.pos.y - 0.15) + 1 + 0.15;
        e.vel.y = 0;
      }

      // spin + bob
      e.mesh.rotation.y += dt * 1.6;
      e.mesh.position.y = e.pos.y + Math.sin(e.age * 3) * 0.05;

      // pickup
      if (e.age > 0.4 && center.distanceTo(e.pos) < 1.1) {
        onPickup(e.id, e.count);
        inventory.add(e.id, e.count);
        this.scene.remove(e.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  get count(): number {
    return this.items.length;
  }
}
