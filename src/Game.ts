import * as THREE from 'three';
import { TextureAtlas } from './textures/TextureAtlas';
import { World } from './engine/World';
import { Player, type InputState } from './player/Player';
import { PlayerModel } from './player/PlayerModel';
import { raycastVoxel, type RayHit } from './engine/VoxelRaycaster';
import { Hud } from './ui/Hud';
import { InventoryScreen } from './ui/InventoryScreen';
import { Block, blockDef, isSolid } from './blocks/blockTypes';
import { Inventory } from './inventory/Inventory';
import { Item, itemDef, dropsFor, type ToolKind } from './items/items';
import { PlayerStats } from './survival/PlayerStats';
import { EntityManager } from './entities/EntityManager';
import { MobManager } from './entities/Mobs';
import { SoundEngine } from './audio/SoundEngine';
import { Sky } from './render/Sky';
import { CRACK_TILES } from './textures/generateTextures';
import { SEA_LEVEL } from './engine/constants';
import { WorldStore, type SaveData } from './persistence/WorldStore';
import { hashSeed } from './util/PRNG';

const DAY_BLUE = new THREE.Color(0x87ceeb);
const NIGHT_BLUE = new THREE.Color(0x0a0c1e);
const RENDER_DISTANCE = 8;
const DAY_LENGTH = 600;
const SPAWN = { x: 8, z: 8 };

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private atlas: TextureAtlas;
  private world: World;
  private player: Player;
  private hud: Hud;
  private invScreen: InventoryScreen;
  private inventory = new Inventory();
  private stats = new PlayerStats();
  private entities: EntityManager;
  private mobs: MobManager;
  private sound = new SoundEngine();
  private isNight = false;
  private attackCooldown = 0;
  private mobTargeted = false;

  private input: InputState = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
  private viewMode = 0; // 0 first-person, 1 third-back, 2 third-front
  private cinematic = true; // slow camera pan behind the title screen
  private playerModel: PlayerModel;
  private sky: Sky;
  private lastSpace = 0;
  private baseFov = 72;
  private locked = false;

  private pauseEl!: HTMLDivElement;
  private playStartedAt = 0;
  private highlight: THREE.LineSegments;
  private crackMesh: THREE.Mesh;
  private crackMaterials: THREE.MeshBasicMaterial[] = [];
  private currentHit: RayHit | null = null;

  private leftHeld = false;
  private rightHeld = false;
  private actionCooldown = 0;
  private eatCooldown = 0;

  // mining state
  private miningKey: string | null = null;
  private breakProgress = 0;
  private breakTime = 0;

  // fall + footsteps
  private peakY = 0;
  private wasOnGround = true;
  private footstepTimer = 0;

  private timeOfDay = 0.3;
  private clock = new THREE.Clock();
  private skyColor = new THREE.Color();

  private fpsAccum = 0; private fpsFrames = 0; private fps = 0;
  private hotbarDirty = true;
  private lastStatKey = '';
  private deathShown = false;
  private save: SaveData | null = null;

  constructor(parent: HTMLElement, seedStr = 'voxelcraft') {
    void seedStr;
    const seed = Math.floor(Math.random() * 0x7fffffff); // new random world each load

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

    const fogFar = RENDER_DISTANCE * 16;
    this.scene.fog = new THREE.Fog(DAY_BLUE.getHex(), fogFar * 0.55, fogFar);

    // hemisphere light only affects Lambert-shaded mobs (world uses MeshBasic)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.3));

    this.atlas = new TextureAtlas();
    this.world = new World(this.scene, this.atlas, seed);
    this.player = new Player(this.camera);
    this.hud = new Hud(parent, this.atlas);
    this.invScreen = new InventoryScreen(parent, this.atlas, this.inventory, this.sound);
    this.invScreen.onClose = () => {
      this.hotbarDirty = true;
      this.lock();
    };
    this.setupPauseOverlay(parent);
    this.entities = new EntityManager(this.scene, this.atlas);
    this.mobs = new MobManager(this.scene);
    this.playerModel = new PlayerModel(this.scene);
    this.sky = new Sky(this.scene);

    // block selection wireframe
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // crack overlay
    this.crackMaterials = CRACK_TILES.map((tile) => this.makeOverlayMaterial(tile));
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), this.crackMaterials[0]);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // Every page load (and F5) starts a brand-new random world.
    WorldStore.clear();
    this.save = null;
    this.giveStartingItems();
    this.spawnPlayer();
    this.bindEvents();
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Called from the play button (user gesture): end the title intro + enable audio + lock. */
  onPlay(): void {
    this.cinematic = false;
    this.sound.resume();
    this.playStartedAt = performance.now();
    this.lock();
  }

  /** Robustly request pointer lock (swallows the promise rejection some browsers throw). */
  private lock(): void {
    if (this.invScreen.open) return;
    const el = this.renderer.domElement as HTMLElement & { requestPointerLock: (o?: unknown) => unknown };
    try {
      const p = el.requestPointerLock();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch { /* ignore */ }
  }

  private setupPauseOverlay(parent: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'vc-pause';
    el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);z-index:25;cursor:pointer;font-family:monospace;color:#fff';
    el.innerHTML = '<div style="text-align:center;background:rgba(8,14,28,0.65);border:2px solid rgba(255,255,255,0.18);padding:24px 44px;border-radius:6px"><div style="font-size:26px;letter-spacing:2px">▶ Click to play</div><div style="font-size:12px;color:#bcd;margin-top:8px">click to control the mouse · Esc to release</div></div>';
    el.addEventListener('click', () => this.lock());
    parent.appendChild(el);
    this.pauseEl = el;
  }

  /** Show the "click to play" prompt whenever the game is live but the pointer isn't locked. */
  private updatePauseOverlay(): void {
    // grace window after pressing Play so the prompt never flashes over a lock that's still engaging
    const grace = performance.now() - this.playStartedAt < 700;
    const show = !this.cinematic && !this.locked && !this.invScreen.open && !this.stats.dead && !grace;
    const disp = show ? 'flex' : 'none';
    if (this.pauseEl.style.display !== disp) this.pauseEl.style.display = disp;
  }

  private get creative(): boolean {
    return this.player.flying;
  }

  private makeOverlayMaterial(tile: string): THREE.MeshBasicMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rect = this.atlas.getTilePixelRect(tile);
    ctx.drawImage(this.atlas.canvas, rect.x, rect.y, 16, 16, 0, 0, 16, 16);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false });
  }

  private giveStartingItems(): void {
    // building blocks first so right-click places immediately; tools in 7-9
    this.inventory.setSlot(0, { id: Block.GRASS, count: 64 });
    this.inventory.setSlot(1, { id: Block.DIRT, count: 64 });
    this.inventory.setSlot(2, { id: Block.STONE, count: 64 });
    this.inventory.setSlot(3, { id: Block.OAK_LOG, count: 64 });
    this.inventory.setSlot(4, { id: Block.PLANKS, count: 64 });
    this.inventory.setSlot(5, { id: Block.GLASS, count: 32 });
    this.inventory.setSlot(6, { id: Item.WOODEN_PICKAXE, count: 1 });
    this.inventory.setSlot(7, { id: Item.WOODEN_AXE, count: 1 });
    this.inventory.setSlot(8, { id: Item.WOODEN_SHOVEL, count: 1 });
  }

  /** Pick an elevated, scenic dry vantage near origin and face the open view. */
  private findSpawn(): { x: number; z: number; y: number; yaw: number; pitch: number } {
    const t = this.world.terrain;
    let best: { x: number; z: number; h: number; score: number } | null = null;
    for (let dx = -30; dx <= 30; dx += 2) {
      for (let dz = -30; dz <= 30; dz += 2) {
        const x = SPAWN.x + dx, z = SPAWN.z + dz;
        const h = t.heightAt(x, z);
        if (h < SEA_LEVEL + 4) continue; // dry + a little elevated
        // prefer pleasant hills (~sea+14), not extreme peaks
        const score = h - Math.abs(h - (SEA_LEVEL + 14)) * 1.5;
        if (!best || score > best.score) best = { x, z, h, score };
      }
    }
    if (!best) { const h = t.heightAt(SPAWN.x, SPAWN.z); best = { x: SPAWN.x, z: SPAWN.z, h, score: 0 }; }

    // face the most open (lowest) direction for a nice vista
    let lowDir = { dx: 0, dz: -1 }, lowH = Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const hh = t.heightAt(Math.round(best.x + dx * 14), Math.round(best.z + dz * 14));
      if (hh < lowH) { lowH = hh; lowDir = { dx, dz }; }
    }
    const yaw = Math.atan2(-lowDir.dx, -lowDir.dz);
    return { x: best.x, z: best.z, y: best.h + 2, yaw, pitch: -0.12 };
  }

  private spawnPlayer(): void {
    let sx: number, sy: number, sz: number, yaw = 0, pitch = 0;
    if (this.save) {
      sx = this.save.player.x; sy = this.save.player.y; sz = this.save.player.z;
      yaw = this.save.player.yaw; pitch = this.save.player.pitch;
      SPAWN.x = Math.floor(sx); SPAWN.z = Math.floor(sz);
      this.cinematic = false; // returning players skip the intro
    } else {
      const s = this.findSpawn();
      SPAWN.x = s.x; SPAWN.z = s.z;
      sx = s.x + 0.5; sy = s.y; sz = s.z + 0.5;
      yaw = s.yaw; pitch = s.pitch;
      this.timeOfDay = 0.22; // bright morning for a good first impression
    }
    const pcx = Math.floor(sx / 16), pcz = Math.floor(sz / 16);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        this.world.forceLoad(pcx + dx, pcz + dz);
    this.player.yaw = yaw; this.player.pitch = pitch;
    this.player.setPosition(sx, sy, sz);
    this.peakY = this.player.pos.y;
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => { if (!this.locked && !this.invScreen.open) this.lock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.leftHeld = false; this.rightHeld = false; this.resetMining(); }
      this.updatePauseOverlay();
    });
    document.addEventListener('mousemove', (e) => { if (this.locked) this.player.applyMouse(e.movementX, e.movementY, 0.0022); });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked || this.stats.dead) return;
      if (e.button === 0) {
        this.leftHeld = true;
        if (this.mobTargeted && this.attackCooldown <= 0) { this.tryMelee(); this.attackCooldown = 0.45; }
        else if (this.creative) { this.breakCreative(); this.actionCooldown = 0.22; }
      }
      if (e.button === 2) {
        this.rightHeld = true;
        if (!this.tryOpenTable()) { this.useRight(); this.actionCooldown = 0.24; }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.leftHeld = false; this.resetMining(); }
      if (e.button === 2) this.rightHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.selectSlot((this.inventory.selected + Math.sign(e.deltaY) + 9) % 9);
    }, { passive: true });

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.onResize());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.input.forward = down; e.preventDefault(); break;
      case 'KeyS': case 'ArrowDown': this.input.back = down; e.preventDefault(); break;
      case 'KeyA': case 'ArrowLeft': this.input.left = down; e.preventDefault(); break;
      case 'KeyD': case 'ArrowRight': this.input.right = down; e.preventDefault(); break;
      case 'Space':
        this.input.jump = down; e.preventDefault();
        if (down && !e.repeat) { const t = performance.now(); if (t - this.lastSpace < 300) this.player.toggleFly(); this.lastSpace = t; }
        break;
      case 'ShiftLeft': this.input.sneak = down; break;
      case 'ControlLeft': this.input.sprint = down; break;
      case 'KeyF': if (down) this.player.toggleFly(); break;
      case 'KeyV': if (down) this.cycleView(); break; // view cycle moved off F5 so F5 reloads a new world
      case 'KeyE': if (down) this.toggleInventory(2); break;
      case 'Escape': if (down && this.invScreen.open) this.invScreen.hide(); break;
      default:
        if (down && e.code.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10);
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        }
    }
  }

  private toggleInventory(cols: 2 | 3): void {
    if (this.invScreen.open) { this.invScreen.hide(); return; }
    if (document.pointerLockElement) document.exitPointerLock();
    this.leftHeld = this.rightHeld = false;
    this.resetMining();
    this.invScreen.show(cols);
  }

  private tryOpenTable(): boolean {
    const hit = this.currentHit;
    if (!hit) return false;
    if (this.world.getBlock(hit.bx, hit.by, hit.bz) !== Block.CRAFTING_TABLE) return false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.leftHeld = this.rightHeld = false;
    this.resetMining();
    this.invScreen.show(3);
    return true;
  }

  private selectSlot(i: number): void {
    this.inventory.selected = i;
    this.hud.setSelected(i);
    this.resetMining();
  }

  private cycleView(): void {
    this.viewMode = (this.viewMode + 1) % 3;
    this.playerModel.setVisible(this.viewMode !== 0);
  }

  /** March from the eye until a solid block, so the third-person camera never clips terrain. */
  private cameraClip(eye: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    for (let d = 0.4; d < maxDist; d += 0.25) {
      const b = this.world.getBlock(Math.floor(eye.x + dir.x * d), Math.floor(eye.y + dir.y * d), Math.floor(eye.z + dir.z * d));
      if (isSolid(b)) return Math.max(0.4, d - 0.3);
    }
    return maxDist;
  }

  private updateView(dt: number): void {
    const moving = Math.hypot(this.player.vel.x, this.player.vel.z) > 0.5;
    this.playerModel.update(this.player.pos, this.player.yaw, moving, dt);

    // sprint widens FOV slightly (Minecraft feel)
    const targetFov = this.baseFov + (this.input.sprint && !this.player.sneaking && moving ? 6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }

    if (this.viewMode === 0) return; // first-person already positioned by Player
    const eye = this.player.eye;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (this.viewMode === 1) {
      const dist = this.cameraClip(eye, dir.clone().negate(), 3.6);
      this.camera.position.copy(eye).addScaledVector(dir, -dist);
    } else {
      const dist = this.cameraClip(eye, dir, 3.6);
      this.camera.position.copy(eye).addScaledVector(dir, dist);
      this.camera.lookAt(eye);
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------- block interaction ----------------

  private toolApplies(kind: ToolKind, blockId: number): boolean {
    switch (kind) {
      case 'pickaxe': return [Block.STONE, Block.COBBLESTONE, Block.COAL_ORE, Block.IRON_ORE].includes(blockId);
      case 'axe': return [Block.OAK_LOG, Block.PLANKS].includes(blockId);
      case 'shovel': return [Block.DIRT, Block.GRASS, Block.SAND, Block.GRAVEL, Block.SNOW].includes(blockId);
      default: return false;
    }
  }

  private computeBreakTime(blockId: number): number {
    const hardness = blockDef(blockId).hardness;
    if (hardness === Infinity) return Infinity;
    if (hardness === 0) return 0.05;
    const tool = itemDef(this.inventory.getSelected()?.id ?? -1)?.tool;
    const mult = tool && this.toolApplies(tool.kind, blockId) ? tool.speed : 1;
    return Math.max(0.05, (hardness * 1.5) / mult);
  }

  private resetMining(): void {
    this.miningKey = null;
    this.breakProgress = 0;
    this.crackMesh.visible = false;
  }

  private updateMining(dt: number): void {
    if (this.creative || this.mobTargeted) { this.crackMesh.visible = false; return; }
    const hit = this.currentHit;
    if (!this.leftHeld || !hit) { this.resetMining(); return; }

    const id = this.world.getBlock(hit.bx, hit.by, hit.bz);
    if (blockDef(id).hardness === Infinity) { this.resetMining(); return; }

    const key = `${hit.bx},${hit.by},${hit.bz}`;
    if (key !== this.miningKey) {
      this.miningKey = key;
      this.breakProgress = 0;
      this.breakTime = this.computeBreakTime(id);
    }
    this.breakProgress += dt;

    const stage = Math.min(CRACK_TILES.length - 1, Math.floor((this.breakProgress / this.breakTime) * CRACK_TILES.length));
    this.crackMesh.material = this.crackMaterials[stage];
    this.crackMesh.position.set(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5);
    this.crackMesh.visible = true;

    if (this.breakProgress >= this.breakTime) {
      this.breakSurvival(hit.bx, hit.by, hit.bz, id);
      this.resetMining();
    }
  }

  private breakSurvival(bx: number, by: number, bz: number, id: number): void {
    this.world.setBlock(bx, by, bz, Block.AIR);
    this.sound.blockBreak(id);
    this.stats.addExhaustion(0.6);

    let drop = dropsFor(id);
    if (id === Block.OAK_LEAVES) {
      const roll = Math.random();
      if (roll < 0.04) drop = { id: Item.APPLE, count: 1 };
      else if (roll < 0.1) drop = { id: Item.STICK, count: 1 };
      else drop = null;
    }
    if (drop) this.entities.spawn(bx + 0.5, by + 0.5, bz + 0.5, drop.id, drop.count);
  }

  private breakCreative(): void {
    const hit = this.currentHit;
    if (!hit) return;
    const id = this.world.getBlock(hit.bx, hit.by, hit.bz);
    if (blockDef(id).hardness === Infinity) return;
    this.world.setBlock(hit.bx, hit.by, hit.bz, Block.AIR);
    this.sound.blockBreak(id);
  }

  private useRight(): void {
    const stack = this.inventory.getSelected();
    if (!stack) return;
    const def = itemDef(stack.id);
    if (!def) return;

    // eat food
    if (def.food && this.stats.hunger < this.stats.maxHunger && this.eatCooldown <= 0) {
      this.stats.feed(def.food);
      this.sound.eat();
      if (!this.creative) { this.inventory.decrementSelected(); this.hotbarDirty = true; }
      this.eatCooldown = 0.8;
      return;
    }

    // place block
    if (def.block !== undefined) this.placeBlock(def.block);
  }

  private placeBlock(blockId: number): void {
    const hit = this.currentHit;
    if (!hit) return;
    if (this.world.getBlock(hit.px, hit.py, hit.pz) !== Block.AIR) return;
    if (isSolid(blockId) && this.overlapsPlayer(hit.px, hit.py, hit.pz)) return;
    this.world.setBlock(hit.px, hit.py, hit.pz, blockId);
    this.sound.blockPlace(blockId);
    if (!this.creative) { this.inventory.decrementSelected(); this.hotbarDirty = true; }
  }

  private overlapsPlayer(x: number, y: number, z: number): boolean {
    const p = this.player.pos;
    const hw = 0.3, h = 1.8;
    return x + 1 > p.x - hw && x < p.x + hw && y + 1 > p.y && y < p.y + h && z + 1 > p.z - hw && z < p.z + hw;
  }

  private updateRaycast(): void {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.currentHit = raycastVoxel(this.world, this.player.eye, dir, 6);
    if (this.currentHit) {
      this.highlight.visible = true;
      this.highlight.position.set(this.currentHit.bx + 0.5, this.currentHit.by + 0.5, this.currentHit.bz + 0.5);
    } else {
      this.highlight.visible = false;
    }
  }

  // ---------------- world systems ----------------

  private updateDayNight(dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
    const s = Math.sin(this.timeOfDay * Math.PI * 2);
    const daylight = Math.max(0.2, Math.min(1, 0.2 + 0.95 * s));
    const norm = (daylight - 0.2) / 0.8;
    this.skyColor.copy(NIGHT_BLUE).lerp(DAY_BLUE, norm);
    this.scene.background = this.skyColor;
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.world.setDaylight(daylight);
    this.sky.update(this.player.pos, this.timeOfDay, norm, dt);
    this.isNight = daylight < 0.4;
  }

  /** Mob callbacks: take damage with knockback, and spawn drops. */
  private mobContext() {
    return {
      damagePlayer: (amount: number, fromX: number, fromZ: number) => {
        if (this.creative) return; // creative = invulnerable
        this.stats.damage(amount);
        const dx = this.player.pos.x - fromX, dz = this.player.pos.z - fromZ;
        const len = Math.hypot(dx, dz) || 1;
        this.player.vel.x += (dx / len) * 5;
        this.player.vel.z += (dz / len) * 5;
        this.player.vel.y = 4;
      },
      spawnDrop: (x: number, y: number, z: number, id: number, count: number) => this.entities.spawn(x, y, z, id, count),
      onMobHurt: () => this.sound.hurt(),
    };
  }

  private blockDistance(): number {
    if (!this.currentHit) return Infinity;
    const e = this.player.eye;
    return Math.hypot(this.currentHit.bx + 0.5 - e.x, this.currentHit.by + 0.5 - e.y, this.currentHit.bz + 0.5 - e.z);
  }

  private tryMelee(): boolean {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.mobs.tryAttack(this.player.eye, dir, 3.4, this.blockDistance(), 4, this.mobContext());
  }

  private updateFallAndSteps(dt: number): void {
    if (this.player.flying) { this.peakY = this.player.pos.y; this.wasOnGround = true; return; }

    if (this.player.onGround) {
      if (!this.wasOnGround) {
        const fall = this.peakY - this.player.pos.y;
        const dmg = Math.floor(Math.max(0, fall - 3));
        if (dmg > 0 && !this.player.inWater) { this.stats.damage(dmg); this.stats.addExhaustion(0.2); }
      }
      this.peakY = this.player.pos.y;

      // footsteps
      const speed = Math.hypot(this.player.vel.x, this.player.vel.z);
      if (speed > 0.6) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          const below = this.world.getBlock(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y - 0.1), Math.floor(this.player.pos.z));
          this.sound.footstep(below);
          this.footstepTimer = this.input.sprint ? 0.3 : 0.42;
          this.stats.addExhaustion(this.input.sprint ? 0.1 : 0.05);
        }
      } else {
        this.footstepTimer = 0;
      }
    } else {
      this.peakY = Math.max(this.peakY, this.player.pos.y);
    }
    this.wasOnGround = this.player.onGround;
  }

  private respawn(): void {
    this.stats.reset();
    const h = this.world.terrain.heightAt(SPAWN.x, SPAWN.z);
    this.player.setPosition(SPAWN.x + 0.5, h + 2, SPAWN.z + 0.5);
    this.peakY = this.player.pos.y;
    this.deathShown = false;
    this.lock(); // re-grab the mouse after respawn (Respawn click is a user gesture)
  }

  // ---------------- loop ----------------

  start(): void {
    this.clock.start();
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  private frame(): void {
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;

    // title intro: slow cinematic pan over the world behind the menu
    if (this.cinematic) {
      this.player.spin(dt * 0.05);
      this.world.update(this.player.pos.x, this.player.pos.z, RENDER_DISTANCE);
      this.updateDayNight(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Simulate only while actively playing: pointer locked, no menu, not dead.
    // (Unlocked = "Click to play" prompt = paused, so mobs freeze.)
    if (this.locked && !this.invScreen.open && !this.stats.dead) {
    this.actionCooldown -= dt;
    this.eatCooldown -= dt;
    this.attackCooldown -= dt;

    if (!this.stats.dead) {
      this.player.update(dt, this.world, this.input);
    }
    this.world.update(this.player.pos.x, this.player.pos.z, RENDER_DISTANCE);
    this.updateRaycast();
    this.updateDayNight(dt);
    this.updateFallAndSteps(dt);

    // survival stats (creative = no hunger/damage)
    if (this.creative) {
      this.stats.health = this.stats.maxHealth;
      this.stats.hunger = this.stats.maxHunger;
      this.stats.air = this.stats.maxAir;
      this.stats.dead = false;
      if (this.deathShown) { this.hud.hideDeath(); this.deathShown = false; }
    } else {
      const submerged = this.world.getBlock(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y + 1.6), Math.floor(this.player.pos.z)) === Block.WATER;
      this.stats.update(dt, submerged);
      if (this.stats.pendingHurt) { this.hud.flashDamage(); this.sound.hurt(); this.stats.pendingHurt = false; }
      if (this.stats.dead && !this.deathShown) {
        this.deathShown = true;
        if (document.pointerLockElement) document.exitPointerLock(); // free the cursor for the Respawn button
        this.hud.showDeath(() => this.respawn());
      }
    }

    // is a mob in our crosshair (closer than the targeted block)?
    const lookDir = new THREE.Vector3();
    this.camera.getWorldDirection(lookDir);
    this.mobTargeted = !this.stats.dead && this.mobs.hasTarget(this.player.eye, lookDir, 3.4, this.blockDistance());

    // interactions
    if (!this.stats.dead) {
      this.updateMining(dt);
      if (this.leftHeld && this.mobTargeted && this.attackCooldown <= 0) {
        this.tryMelee();
        this.attackCooldown = 0.45;
      } else if (this.actionCooldown <= 0) {
        if (this.creative && this.leftHeld && !this.mobTargeted) { this.breakCreative(); this.actionCooldown = 0.22; }
        else if (this.rightHeld) { this.useRight(); this.actionCooldown = 0.22; }
      }
    }

    // entities (pickups) + mobs
    this.entities.update(dt, this.world, this.player.pos, this.inventory, () => {
      this.sound.pickup();
      this.hotbarDirty = true;
    });
    this.mobs.update(dt, this.world, this.player.pos, this.isNight, this.mobContext());
    this.updateView(dt);
    } // end simulation gate

    // HUD
    if (this.hotbarDirty) { this.hud.buildHotbar(this.inventory.slots, this.inventory.selected); this.hotbarDirty = false; }
    const statKey = `${this.stats.health}|${this.stats.hunger}|${this.stats.air}`;
    if (statKey !== this.lastStatKey) {
      this.hud.updateStats(this.stats.health, this.stats.hunger, this.stats.air, this.stats.maxAir);
      this.lastStatKey = statKey;
    }

    this.fpsAccum += dt; this.fpsFrames++;
    if (this.fpsAccum >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAccum); this.fpsAccum = 0; this.fpsFrames = 0; }
    const p = this.player.pos;
    const clock24 = Math.floor(this.timeOfDay * 24).toString().padStart(2, '0');
    this.hud.setDebug(
      `VoxelCraft  ${this.fps} fps\n` +
      `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
      `chunks ${this.world.loadedChunkCount}  mobs ${this.mobs.count}  ${clock24}:00` +
      (this.isNight ? ' ☾' : ' ☀') +
      (this.creative ? '  [creative]' : '  [survival]'),
    );

    this.updatePauseOverlay();
    this.renderer.render(this.scene, this.camera);
  }
}
