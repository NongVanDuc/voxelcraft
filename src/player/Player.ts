import * as THREE from 'three';
import { World } from '../engine/World';
import { isSolid, Block } from '../blocks/blockTypes';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  sneak: boolean; // crouch (slow + edge-stop) / fly-down
}

const WIDTH = 0.6;
const HALF = WIDTH / 2;
const HEIGHT = 1.8;
const EYE = 1.62;
const EPS = 0.001;

const GRAVITY = 26;
const JUMP_SPEED = 8.2;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.8;
const SNEAK_SPEED = 1.6;
const FLY_SPEED = 11;
const TERMINAL = 55;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  inWater = false;
  sneaking = false;

  private readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  setPosition(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.syncCamera();
  }

  toggleFly(): void {
    this.flying = !this.flying;
    this.vel.y = 0;
  }

  applyMouse(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  /** World-space eye position (camera origin). */
  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  update(dt: number, world: World, input: InputState): void {
    // horizontal wish direction from yaw
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = 0, wz = 0;
    if (input.forward) { wx += fx; wz += fz; }
    if (input.back) { wx -= fx; wz -= fz; }
    if (input.right) { wx += rx; wz += rz; }
    if (input.left) { wx -= rx; wz -= rz; }
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    this.inWater = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z)) === Block.WATER;
    this.sneaking = input.sneak && this.onGround && !this.flying;

    if (this.flying) {
      const speed = FLY_SPEED * (input.sprint ? 1.8 : 1);
      this.vel.x = wx * speed;
      this.vel.z = wz * speed;
      this.vel.y = (input.jump ? 1 : 0) * speed - (input.sneak ? 1 : 0) * speed;
    } else {
      let base = input.sprint ? SPRINT_SPEED : WALK_SPEED;
      if (input.sneak) base = SNEAK_SPEED;
      const speed = this.inWater ? base * 0.5 : base;
      this.vel.x = wx * speed;
      this.vel.z = wz * speed;

      if (this.inWater) {
        this.vel.y -= GRAVITY * 0.3 * dt;
        if (input.jump) this.vel.y = 3.5; // swim up
        this.vel.y = Math.max(this.vel.y, -6);
      } else {
        this.vel.y -= GRAVITY * dt;
        if (this.vel.y < -TERMINAL) this.vel.y = -TERMINAL;
        if (input.jump && this.onGround) this.vel.y = JUMP_SPEED;
      }
    }

    // integrate axis-by-axis with collision
    this.moveX(world, this.vel.x * dt);
    this.moveZ(world, this.vel.z * dt);
    this.moveY(world, this.vel.y * dt);

    this.syncCamera();
  }

  private collides(world: World): boolean {
    const minX = Math.floor(this.pos.x - HALF + EPS);
    const maxX = Math.floor(this.pos.x + HALF - EPS);
    const minY = Math.floor(this.pos.y + EPS);
    const maxY = Math.floor(this.pos.y + HEIGHT - EPS);
    const minZ = Math.floor(this.pos.z - HALF + EPS);
    const maxZ = Math.floor(this.pos.z + HALF - EPS);
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++)
          if (isSolid(world.getBlock(x, y, z))) return true;
    return false;
  }

  private moveX(world: World, dx: number): void {
    const prev = this.pos.x;
    this.pos.x += dx;
    if (this.collides(world)) {
      if (dx > 0) this.pos.x = Math.floor(this.pos.x + HALF) - HALF - EPS;
      else if (dx < 0) this.pos.x = Math.floor(this.pos.x - HALF) + 1 + HALF + EPS;
      this.vel.x = 0;
    }
    if (this.sneaking && !this.hasGroundUnder(world)) { this.pos.x = prev; this.vel.x = 0; }
  }

  private moveZ(world: World, dz: number): void {
    const prev = this.pos.z;
    this.pos.z += dz;
    if (this.collides(world)) {
      if (dz > 0) this.pos.z = Math.floor(this.pos.z + HALF) - HALF - EPS;
      else if (dz < 0) this.pos.z = Math.floor(this.pos.z - HALF) + 1 + HALF + EPS;
      this.vel.z = 0;
    }
    if (this.sneaking && !this.hasGroundUnder(world)) { this.pos.z = prev; this.vel.z = 0; }
  }

  /** Any solid block directly beneath the player's footprint (for sneak edge-stop). */
  private hasGroundUnder(world: World): boolean {
    const y = Math.floor(this.pos.y - 0.05);
    const minX = Math.floor(this.pos.x - HALF + EPS), maxX = Math.floor(this.pos.x + HALF - EPS);
    const minZ = Math.floor(this.pos.z - HALF + EPS), maxZ = Math.floor(this.pos.z + HALF - EPS);
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++)
        if (isSolid(world.getBlock(x, y, z))) return true;
    return false;
  }

  private moveY(world: World, dy: number): void {
    this.pos.y += dy;
    this.onGround = false;
    if (this.collides(world)) {
      if (dy > 0) {
        this.pos.y = Math.floor(this.pos.y + HEIGHT) - HEIGHT - EPS;
      } else if (dy < 0) {
        this.pos.y = Math.floor(this.pos.y) + 1;
        this.onGround = true;
      }
      this.vel.y = 0;
    }
  }

  private syncCamera(): void {
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
