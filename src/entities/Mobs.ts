import * as THREE from 'three';
import { World } from '../engine/World';
import { isSolid, Block } from '../blocks/blockTypes';
import { Item } from '../items/items';

export type MobType = 'zombie' | 'pig' | 'cow' | 'sheep' | 'chicken';

interface MobConfig {
  hostile: boolean;
  maxHp: number;
  speed: number;
  width: number;
  height: number;
  attack: number;
}

const CONFIG: Record<MobType, MobConfig> = {
  zombie: { hostile: true, maxHp: 20, speed: 1.7, width: 0.6, height: 1.9, attack: 3 },
  pig: { hostile: false, maxHp: 10, speed: 1.1, width: 0.7, height: 0.9, attack: 0 },
  cow: { hostile: false, maxHp: 10, speed: 1.0, width: 0.8, height: 1.0, attack: 0 },
  sheep: { hostile: false, maxHp: 8, speed: 1.0, width: 0.7, height: 0.95, attack: 0 },
  chicken: { hostile: false, maxHp: 4, speed: 0.9, width: 0.4, height: 0.5, attack: 0 },
};

const ANIMAL_COLORS: Record<string, { body: number; leg: number }> = {
  pig: { body: 0xe39aa6, leg: 0xd98b98 },
  cow: { body: 0x5b4636, leg: 0x46362a },
  sheep: { body: 0xeae6dc, leg: 0x52483f },
  chicken: { body: 0xf2f2f2, leg: 0xe0a030 },
};

const PASSIVE_TYPES: MobType[] = ['pig', 'cow', 'sheep', 'chicken'];

const GRAVITY = 24;

function part(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

class Mob {
  type: MobType;
  cfg: MobConfig;
  pos: THREE.Vector3;
  vel = new THREE.Vector3();
  yaw = 0;
  hp: number;
  onGround = false;
  group = new THREE.Group();
  legs: THREE.Mesh[] = [];
  walkPhase = 0;
  wanderTimer = 0;
  attackCooldown = 0;
  hurtFlash = 0;
  dead = false;
  daylightTimer = 0;

  constructor(type: MobType, x: number, y: number, z: number) {
    this.type = type;
    this.cfg = CONFIG[type];
    this.hp = this.cfg.maxHp;
    this.pos = new THREE.Vector3(x, y, z);
    if (type === 'zombie') this.buildZombie();
    else this.buildAnimal(type);
    this.group.position.copy(this.pos);
  }

  private add(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  private buildZombie(): void {
    const skin = 0x4f7d4a, shirt = 0x3a4a6b, pants = 0x2c3450;
    this.add(part(0.5, 0.5, 0.5, skin), 0, 1.7, 0); // head
    this.add(part(0.5, 0.7, 0.28, shirt), 0, 1.1, 0); // body
    const armL = this.add(part(0.2, 0.7, 0.2, skin), -0.35, 1.45, 0.25);
    const armR = this.add(part(0.2, 0.7, 0.2, skin), 0.35, 1.45, 0.25);
    armL.rotation.x = -Math.PI / 2; armR.rotation.x = -Math.PI / 2; // arms forward
    this.legs.push(this.add(part(0.22, 0.75, 0.22, pants), -0.13, 0.375, 0));
    this.legs.push(this.add(part(0.22, 0.75, 0.22, pants), 0.13, 0.375, 0));
    // eyes
    this.add(part(0.1, 0.1, 0.02, 0x220000), -0.12, 1.72, 0.26);
    this.add(part(0.1, 0.1, 0.02, 0x220000), 0.12, 1.72, 0.26);
  }

  private buildAnimal(type: MobType): void {
    const col = ANIMAL_COLORS[type] ?? ANIMAL_COLORS.pig;
    const bw = this.cfg.width, bh = this.cfg.height;
    this.add(part(bw, bh * 0.5, bw * 1.3, col.body), 0, bh * 0.6, 0); // body
    this.add(part(bw * 0.7, bh * 0.5, bw * 0.6, col.body), 0, bh * 0.62, bw * 0.85); // head front (+z)

    if (type === 'pig') {
      this.add(part(0.22, 0.18, 0.1, 0xc97f8c), 0, bh * 0.55, bw * 1.18); // snout
    } else if (type === 'chicken') {
      this.add(part(0.12, 0.1, 0.16, 0xe0a030), 0, bh * 0.6, bw * 1.2); // beak
      this.add(part(0.1, 0.12, 0.12, 0xd03030), 0, bh * 0.92, bw * 0.85); // comb
    } else if (type === 'cow' || type === 'sheep') {
      this.add(part(0.12, 0.12, 0.12, 0x2a2a2a), -0.18, bh * 0.95, 0); // ear/horn
      this.add(part(0.12, 0.12, 0.12, 0x2a2a2a), 0.18, bh * 0.95, 0);
    }

    const ly = bh * 0.18;
    const off = bw * 0.32;
    for (const [sx, sz] of [[-off, off], [off, off], [-off, -off], [off, -off]]) {
      this.legs.push(this.add(part(0.18, bh * 0.36, 0.18, col.leg), sx, ly, sz));
    }
  }

  collides(world: World, x: number, y: number, z: number): boolean {
    const hw = this.cfg.width / 2;
    const minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
    const minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
    const minY = Math.floor(y), maxY = Math.floor(y + this.cfg.height - 0.01);
    for (let yy = minY; yy <= maxY; yy++)
      for (let zz = minZ; zz <= maxZ; zz++)
        for (let xx = minX; xx <= maxX; xx++)
          if (isSolid(world.getBlock(xx, yy, zz))) return true;
    return false;
  }

  applyMovement(world: World, dt: number): boolean {
    let blocked = false;
    const nx = this.pos.x + this.vel.x * dt;
    if (!this.collides(world, nx, this.pos.y, this.pos.z)) this.pos.x = nx; else blocked = true;
    const nz = this.pos.z + this.vel.z * dt;
    if (!this.collides(world, this.pos.x, this.pos.y, nz)) this.pos.z = nz; else blocked = true;

    this.vel.y -= GRAVITY * dt;
    const ny = this.pos.y + this.vel.y * dt;
    if (!this.collides(world, this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny; this.onGround = false;
    } else {
      if (this.vel.y < 0) this.onGround = true;
      this.vel.y = 0;
    }
    // hop over a 1-block ledge
    if (blocked && this.onGround) this.vel.y = 7;
    return blocked;
  }

  sync(): void {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.2;
    if (moving) {
      this.walkPhase += 0.18;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.legs.forEach((leg, i) => { leg.rotation.x = i % 2 === 0 ? swing : -swing; });
    }
    if (this.hurtFlash > 0) {
      this.group.traverse((o) => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).emissive?.setRGB(0.5, 0, 0); });
    } else {
      this.group.traverse((o) => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).emissive?.setRGB(0, 0, 0); });
    }
  }
}

export interface MobContext {
  damagePlayer: (amount: number, fromX: number, fromZ: number) => void;
  spawnDrop: (x: number, y: number, z: number, id: number, count: number) => void;
  onMobHurt: () => void;
}

export class MobManager {
  private scene: THREE.Scene;
  private mobs: Mob[] = [];
  private spawnTimer = 0;
  private readonly maxPassive = 6;
  private readonly maxHostile = 10;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get count(): number { return this.mobs.length; }

  clear(): void {
    for (const m of this.mobs) this.scene.remove(m.group);
    this.mobs = [];
  }

  private surfaceY(world: World, x: number, z: number, fromY: number): number | null {
    for (let y = Math.min(120, fromY + 8); y > 2; y--) {
      if (isSolid(world.getBlock(x, y, z)) && world.getBlock(x, y + 1, z) === Block.AIR && world.getBlock(x, y + 2, z) === Block.AIR) {
        return y + 1;
      }
    }
    return null;
  }

  private trySpawn(world: World, playerPos: THREE.Vector3, isNight: boolean): void {
    const passive = this.mobs.filter((m) => !m.cfg.hostile).length;
    const hostile = this.mobs.filter((m) => m.cfg.hostile).length;
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 16;
    const x = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const z = Math.floor(playerPos.z + Math.sin(angle) * dist);
    const y = this.surfaceY(world, x, z, Math.floor(playerPos.y));
    if (y === null) return;
    const ground = world.getBlock(x, y - 1, z);

    if (isNight && hostile < this.maxHostile) {
      this.spawn('zombie', x + 0.5, y, z + 0.5);
    } else if (!isNight && passive < this.maxPassive && (ground === Block.GRASS)) {
      this.spawn(PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)], x + 0.5, y, z + 0.5);
    }
  }

  spawn(type: MobType, x: number, y: number, z: number): void {
    const mob = new Mob(type, x, y, z);
    this.scene.add(mob.group);
    this.mobs.push(mob);
  }

  /** Nearest mob whose body the ray enters within reach (and closer than a block). */
  private pick(eye: THREE.Vector3, dir: THREE.Vector3, reach: number, blockDist: number): Mob | null {
    let best: Mob | null = null;
    let bestT = Math.min(reach, blockDist);
    const toCenter = new THREE.Vector3();
    for (const m of this.mobs) {
      const cx = m.pos.x, cy = m.pos.y + m.cfg.height / 2, cz = m.pos.z;
      toCenter.set(cx - eye.x, cy - eye.y, cz - eye.z);
      const t = toCenter.dot(dir);
      if (t < 0 || t > bestT) continue;
      const px = eye.x + dir.x * t, py = eye.y + dir.y * t, pz = eye.z + dir.z * t;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
      const r = Math.max(m.cfg.width, m.cfg.height * 0.5) * 0.7;
      if (d2 <= r * r) { best = m; bestT = t; }
    }
    return best;
  }

  hasTarget(eye: THREE.Vector3, dir: THREE.Vector3, reach: number, blockDist: number): boolean {
    return this.pick(eye, dir, reach, blockDist) !== null;
  }

  /** Player melee ray: damage nearest mob in front within reach (closer than blockDist). */
  tryAttack(eye: THREE.Vector3, dir: THREE.Vector3, reach: number, blockDist: number, damage: number, ctx: MobContext): boolean {
    const best = this.pick(eye, dir, reach, blockDist);
    if (!best) return false;
    best.hp -= damage;
    best.hurtFlash = 0.2;
    best.vel.x += dir.x * 5; best.vel.z += dir.z * 5; best.vel.y = 5;
    ctx.onMobHurt();
    if (best.hp <= 0) this.kill(best, ctx);
    return true;
  }

  private kill(mob: Mob, ctx: MobContext): void {
    if (mob.type === 'pig') ctx.spawnDrop(mob.pos.x, mob.pos.y + 0.3, mob.pos.z, Item.APPLE, 1 + Math.floor(Math.random() * 2));
    this.scene.remove(mob.group);
    this.mobs = this.mobs.filter((m) => m !== mob);
  }

  update(dt: number, world: World, playerPos: THREE.Vector3, isNight: boolean, ctx: MobContext): void {
    // spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      if (this.mobs.length < this.maxPassive + this.maxHostile) this.trySpawn(world, playerPos, isNight);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.attackCooldown -= dt;
      m.hurtFlash -= dt;

      const dx = playerPos.x - m.pos.x;
      const dz = playerPos.z - m.pos.z;
      const distToPlayer = Math.hypot(dx, dz);

      if (m.cfg.hostile) {
        // burn/despawn in daylight
        if (!isNight) { m.daylightTimer += dt; if (m.daylightTimer > 8) { this.scene.remove(m.group); this.mobs.splice(i, 1); continue; } }
        else m.daylightTimer = 0;

        if (distToPlayer < 24) {
          m.yaw = Math.atan2(dx, dz);
          m.vel.x = Math.sin(m.yaw) * m.cfg.speed;
          m.vel.z = Math.cos(m.yaw) * m.cfg.speed;
          if (distToPlayer < 1.4 && m.attackCooldown <= 0) {
            m.attackCooldown = 1;
            ctx.damagePlayer(m.cfg.attack, m.pos.x, m.pos.z);
          }
        } else { m.vel.x = 0; m.vel.z = 0; }
      } else {
        // passive wander
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = 2 + Math.random() * 3;
          if (Math.random() < 0.5) { m.vel.x = 0; m.vel.z = 0; }
          else { m.yaw = Math.random() * Math.PI * 2; m.vel.x = Math.sin(m.yaw) * m.cfg.speed; m.vel.z = Math.cos(m.yaw) * m.cfg.speed; }
        }
      }

      m.applyMovement(world, dt);

      // despawn if too far
      if (distToPlayer > 64) { this.scene.remove(m.group); this.mobs.splice(i, 1); continue; }
      m.sync();
    }
  }
}
