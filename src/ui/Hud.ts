import { TextureAtlas } from '../textures/TextureAtlas';
import { itemTile } from '../items/items';
import type { ItemStack } from '../inventory/Inventory';

const CSS = `
#vc-hud { position: fixed; inset: 0; pointer-events: none; font-family: monospace; z-index: 10;
  image-rendering: pixelated; -webkit-user-select: none; user-select: none; }
#vc-crosshair { position: absolute; left: 50%; top: 50%; width: 20px; height: 20px; transform: translate(-50%, -50%); }
#vc-crosshair::before, #vc-crosshair::after { content: ''; position: absolute; background: #fff; mix-blend-mode: difference; }
#vc-crosshair::before { left: 9px; top: 2px; width: 2px; height: 16px; }
#vc-crosshair::after { top: 9px; left: 2px; height: 2px; width: 16px; }
#vc-bottom { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; }
#vc-stats { display: flex; justify-content: space-between; width: 412px; }
.vc-statrow { display: flex; gap: 0; }
.vc-statrow.right { flex-direction: row-reverse; }
.vc-statrow canvas { width: 18px; height: 18px; }
#vc-air { display: flex; gap: 0; height: 18px; }
#vc-hotbar { display: flex; gap: 2px; padding: 3px; background: rgba(0,0,0,0.4); border: 2px solid #1b1b1b; }
.vc-slot { width: 44px; height: 44px; position: relative; background: rgba(139,139,139,0.4); border: 2px solid #373737; box-sizing: border-box; }
.vc-slot.sel { border-color: #fff; box-shadow: 0 0 0 2px #fff inset; }
.vc-slot canvas { width: 36px; height: 36px; margin: 4px; image-rendering: pixelated; }
.vc-slot .vc-count { position: absolute; right: 3px; bottom: 1px; color: #fff; font-size: 14px; text-shadow: 1px 1px 0 #000; }
.vc-slot .vc-key { position: absolute; left: 3px; top: 0; color: #bbb; font-size: 10px; text-shadow: 1px 1px 0 #000; }
#vc-debug { position: absolute; left: 6px; top: 6px; color: #fff; font-size: 12px; line-height: 1.4; text-shadow: 1px 1px 0 #000; white-space: pre; }
#vc-hint { position: absolute; right: 8px; bottom: 8px; color: #ddd; font-size: 11px; text-shadow: 1px 1px 0 #000; text-align: right; line-height: 1.5; }
#vc-flash { position: absolute; inset: 0; background: #ff0000; opacity: 0; transition: opacity 0.1s; }
#vc-death { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; background: rgba(120,0,0,0.4); pointer-events: auto; }
#vc-death h1 { color: #ff5555; font-size: 52px; text-shadow: 3px 3px 0 #300; margin: 0 0 24px; }
#vc-death button { font-family: monospace; font-size: 18px; padding: 10px 28px; cursor: pointer; color: #fff; background: #6a6a6a; border: 3px solid #1b1b1b; box-shadow: 0 3px 0 #1b1b1b; }
`;

export class Hud {
  private root: HTMLDivElement;
  private hotbarEl!: HTMLDivElement;
  private heartsEl!: HTMLDivElement;
  private hungerEl!: HTMLDivElement;
  private airEl!: HTMLDivElement;
  private debugEl!: HTMLDivElement;
  private flashEl!: HTMLDivElement;
  private deathEl!: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private atlas: TextureAtlas;

  private heartCanvas: HTMLCanvasElement[] = [];
  private hungerCanvas: HTMLCanvasElement[] = [];
  private heartCache = new Map<number, HTMLCanvasElement>();
  private hungerCache = new Map<number, HTMLCanvasElement>();

  constructor(parent: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'vc-hud';
    this.root.innerHTML = `
      <div id="vc-flash"></div>
      <div id="vc-crosshair"></div>
      <div id="vc-debug"></div>
      <div id="vc-bottom">
        <div id="vc-air"></div>
        <div id="vc-stats">
          <div class="vc-statrow" id="vc-hearts"></div>
          <div class="vc-statrow right" id="vc-hunger"></div>
        </div>
        <div id="vc-hotbar"></div>
      </div>
      <div id="vc-hint">WASD · Ctrl sprint · Shift sneak · Space jump<br>L/R-click break/place · 1-9 · E inventory · F5 view · F / 2×Space fly</div>
      <div id="vc-death"><h1>You Died!</h1><button id="vc-respawn">Respawn</button></div>
    `;
    parent.appendChild(this.root);
    this.hotbarEl = this.root.querySelector('#vc-hotbar')!;
    this.heartsEl = this.root.querySelector('#vc-hearts')!;
    this.hungerEl = this.root.querySelector('#vc-hunger')!;
    this.airEl = this.root.querySelector('#vc-air')!;
    this.debugEl = this.root.querySelector('#vc-debug')!;
    this.flashEl = this.root.querySelector('#vc-flash')!;
    this.deathEl = this.root.querySelector('#vc-death')!;

    this.buildStatRows();
  }

  // ---- hotbar ----
  buildHotbar(items: (ItemStack | null)[], selected: number): void {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const item = items[i];
      const slot = document.createElement('div');
      slot.className = 'vc-slot' + (i === selected ? ' sel' : '');
      if (item) slot.appendChild(this.makeIcon(item.id));
      const key = document.createElement('span');
      key.className = 'vc-key';
      key.textContent = String(i + 1);
      slot.appendChild(key);
      const count = document.createElement('span');
      count.className = 'vc-count';
      count.textContent = item && item.count > 1 ? String(item.count) : '';
      slot.appendChild(count);
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    }
  }

  setSelected(index: number): void {
    this.slots.forEach((s, i) => s.classList.toggle('sel', i === index));
  }

  private makeIcon(id: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rect = this.atlas.getTilePixelRect(itemTile(id));
    ctx.drawImage(this.atlas.canvas, rect.x, rect.y, 16, 16, 0, 0, 16, 16);
    return canvas;
  }

  // ---- stats ----
  private buildStatRows(): void {
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('canvas');
      this.heartsEl.appendChild(h);
      this.heartCanvas.push(h);
      const g = document.createElement('canvas');
      this.hungerEl.appendChild(g);
      this.hungerCanvas.push(g);
    }
  }

  updateStats(health: number, hunger: number, air: number, maxAir: number): void {
    for (let i = 0; i < 10; i++) {
      const hp = Math.max(0, Math.min(2, health - i * 2)) / 2; // 1 / .5 / 0
      this.copyCanvas(this.heartCanvas[i], this.heart(hp));
      const fd = Math.max(0, Math.min(2, hunger - i * 2)) / 2;
      this.copyCanvas(this.hungerCanvas[i], this.haunch(fd));
    }
    // air bubbles
    this.airEl.innerHTML = '';
    if (air < maxAir) {
      for (let i = 0; i < air; i++) {
        const b = document.createElement('canvas');
        this.copyCanvas(b, this.bubble());
        this.airEl.appendChild(b);
      }
    }
  }

  private copyCanvas(target: HTMLCanvasElement, src: HTMLCanvasElement): void {
    target.width = src.width; target.height = src.height;
    const ctx = target.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(src, 0, 0);
  }

  // 9x9 bitmaps scaled up; fraction 1 / .5 / 0
  private heart(fraction: number): HTMLCanvasElement {
    const key = fraction;
    const cached = this.heartCache.get(key);
    if (cached) return cached;
    const bmp = [
      '011000110', '111101111', '111111111', '111111111', '011111110', '001111100', '000111000', '000010000', '000000000',
    ];
    const c = this.renderBitmap(bmp, (x) => (x / 9 < fraction ? '#e23b3b' : '#5a1a1a'), '#3a0d0d');
    this.heartCache.set(key, c);
    return c;
  }

  private haunch(fraction: number): HTMLCanvasElement {
    const cached = this.hungerCache.get(fraction);
    if (cached) return cached;
    const bmp = [
      '000000000', '000011100', '000111110', '001111110', '001111100', '033111000', '333300000', '033000000', '000000000',
    ];
    const c = this.renderBitmap(bmp, (x, ch) => (ch === '3' ? '#efe6c4' : (x / 9 < fraction ? '#c98a4b' : '#4a3a28')), '#2a2018');
    this.hungerCache.set(fraction, c);
    return c;
  }

  private bubble(): HTMLCanvasElement {
    const bmp = ['000000000', '001111000', '011111100', '011101100', '011111100', '011111100', '001111000', '000000000', '000000000'];
    return this.renderBitmap(bmp, () => '#bfe6ff', '#2a4a6a');
  }

  private renderBitmap(rows: string[], color: (x: number, ch: string) => string, shadow: string): HTMLCanvasElement {
    const N = 9, scale = 2;
    const c = document.createElement('canvas');
    c.width = N * scale; c.height = N * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = rows[y][x];
        if (ch === '0') continue;
        ctx.fillStyle = color(x, ch);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  flashDamage(): void {
    this.flashEl.style.opacity = '0.35';
    setTimeout(() => { this.flashEl.style.opacity = '0'; }, 100);
  }

  showDeath(onRespawn: () => void): void {
    this.deathEl.style.display = 'flex';
    const btn = this.deathEl.querySelector('#vc-respawn')!;
    const handler = () => { this.deathEl.style.display = 'none'; btn.removeEventListener('click', handler); onRespawn(); };
    btn.addEventListener('click', handler);
  }

  hideDeath(): void {
    this.deathEl.style.display = 'none';
  }

  setDebug(text: string): void {
    this.debugEl.textContent = text;
  }
}
