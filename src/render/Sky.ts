import * as THREE from 'three';
import { mulberry32 } from '../util/PRNG';

/**
 * Minecraft-style sky: a pixel SQUARE sun and moon that arc with the day/night
 * cycle, flat blocky clouds, and a star field that fades in at night.
 */
export class Sky {
  private sun: THREE.Sprite;
  private moon: THREE.Sprite;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private cloudOffset = 0;

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunTexture(), fog: false, depthWrite: false, transparent: true }));
    this.sun.scale.setScalar(36);
    scene.add(this.sun);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moonTexture(), fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(28);
    scene.add(this.moon);

    this.cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTexture(), transparent: true, opacity: 0.8, depthWrite: false, fog: true, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);

    // star field (upper hemisphere)
    const N = 600, rand = mulberry32(7), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rand(), t = rand() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(t) * rr * 300;
      pos[i * 3 + 1] = u * 300;
      pos[i * 3 + 2] = Math.sin(t) * rr * 300;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.stars = new THREE.Points(geo, this.starMat);
    scene.add(this.stars);
  }

  private nearest(tex: THREE.CanvasTexture): THREE.CanvasTexture {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Pixel square sun: bright core → yellow → orange rim (blocky tiers).
  private sunTexture(): THREE.CanvasTexture {
    const N = 16, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    const mid = (N - 1) / 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - mid), Math.abs(y - mid)) / mid;
      ctx.fillStyle = d <= 0.45 ? '#fff3c4' : d <= 0.78 ? '#ffd84c' : '#ffb02e';
      ctx.fillRect(x, y, 1, 1);
    }
    return this.nearest(new THREE.CanvasTexture(c));
  }

  // Pixel square moon: pale face with a few craters.
  private moonTexture(): THREE.CanvasTexture {
    const N = 16, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      ctx.fillStyle = edge ? '#d6dcea' : '#eef2fb';
      ctx.fillRect(x, y, 1, 1);
    }
    const rand = mulberry32(99);
    for (let i = 0; i < 7; i++) {
      const cx = 2 + Math.floor(rand() * 11), cy = 2 + Math.floor(rand() * 11), s = 1 + Math.floor(rand() * 2);
      ctx.fillStyle = '#c2cad8'; ctx.fillRect(cx, cy, s, s);
    }
    return this.nearest(new THREE.CanvasTexture(c));
  }

  // Flat blocky clouds: white axis-aligned rectangles, hard pixel edges, tileable.
  private cloudTexture(): THREE.CanvasTexture {
    const N = 48, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, N, N);
    const rand = mulberry32(2024);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const rect = (x: number, y: number, w: number, h: number) => {
      ctx.fillRect(x, y, w, h); ctx.fillRect(x - N, y, w, h);
      ctx.fillRect(x, y - N, w, h); ctx.fillRect(x - N, y - N, w, h);
    };
    for (let i = 0; i < 11; i++) {
      let x = Math.floor(rand() * N), y = Math.floor(rand() * N);
      const blocks = 2 + Math.floor(rand() * 4);
      for (let b = 0; b < blocks; b++) {
        rect(x, y, 4 + Math.floor(rand() * 9), 3 + Math.floor(rand() * 5));
        x += Math.floor(rand() * 7) - 3; y += Math.floor(rand() * 5) - 2;
      }
    }
    const tex = this.nearest(new THREE.CanvasTexture(c));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }

  update(camPos: THREE.Vector3, timeOfDay: number, daylight: number, dt: number): void {
    const a = timeOfDay * Math.PI * 2;
    const sx = Math.cos(a), sy = Math.sin(a);
    const D = 280;
    this.sun.position.set(camPos.x + sx * D, camPos.y + sy * D, camPos.z);
    this.moon.position.set(camPos.x - sx * D, camPos.y - sy * D, camPos.z);
    this.sun.visible = sy > -0.2;
    this.moon.visible = sy < 0.2;

    this.cloudOffset += dt * 0.003;
    (this.cloudMat.map as THREE.Texture).offset.x = this.cloudOffset;
    this.clouds.position.set(camPos.x, 100, camPos.z);
    this.cloudMat.opacity = 0.35 + 0.55 * daylight;

    this.stars.position.copy(camPos);
    this.stars.rotation.z = a;
    this.starMat.opacity = Math.max(0, 1 - daylight * 1.6);
  }
}
