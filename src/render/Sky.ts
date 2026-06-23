import * as THREE from 'three';
import { mulberry32 } from '../util/PRNG';

/** Sun + moon that arc across the sky with the day/night cycle, plus drifting clouds. */
export class Sky {
  private sun: THREE.Sprite;
  private moon: THREE.Sprite;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;
  private cloudOffset = 0;

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.discTexture('#fff6c2', '#ffd54a'), fog: false, depthWrite: false, transparent: true }));
    this.sun.scale.setScalar(42);
    scene.add(this.sun);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.discTexture('#ffffff', '#c8d2e6'), fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(34);
    scene.add(this.moon);

    this.cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTexture(), transparent: true, opacity: 0.85, depthWrite: false, fog: true, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);
  }

  private discTexture(inner: string, outer: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, inner);
    g.addColorStop(0.6, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private cloudTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);
    const rand = mulberry32(1337);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 60; i++) {
      const x = rand() * 256, y = rand() * 256, r = 10 + rand() * 26;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // wrap blobs so the texture tiles seamlessly
      ctx.beginPath(); ctx.arc(x - 256, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 256, r, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  update(camPos: THREE.Vector3, timeOfDay: number, daylight: number, dt: number): void {
    const a = timeOfDay * Math.PI * 2;
    const sx = Math.cos(a), sy = Math.sin(a);
    const D = 280;
    this.sun.position.set(camPos.x + sx * D, camPos.y + sy * D, camPos.z);
    this.moon.position.set(camPos.x - sx * D, camPos.y - sy * D, camPos.z);
    this.sun.visible = sy > -0.15;
    this.moon.visible = sy < 0.15;

    // clouds follow the player and drift; fade out at night
    this.cloudOffset += dt * 0.004;
    (this.cloudMat.map as THREE.Texture).offset.x = this.cloudOffset;
    this.clouds.position.set(camPos.x, 100, camPos.z); // fixed cloud layer height
    this.cloudMat.opacity = 0.25 + 0.6 * daylight;
  }
}
