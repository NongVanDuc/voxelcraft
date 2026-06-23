import { TextureAtlas } from '../textures/TextureAtlas';
import { Inventory, type ItemStack } from '../inventory/Inventory';
import { matchRecipe } from '../inventory/Recipes';
import { itemTile, itemDef, itemName, MAX_STACK } from '../items/items';
import { SoundEngine } from '../audio/SoundEngine';

const CSS = `
#vc-inv { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); z-index: 30; pointer-events: auto; font-family: monospace; }
#vc-inv .panel { background: #c6c6c6; border: 4px solid #373737; box-shadow: 0 0 0 4px #555, 6px 6px 0 rgba(0,0,0,0.4);
  padding: 14px; display: flex; flex-direction: column; gap: 12px; }
#vc-inv .title { color: #404040; font-size: 16px; font-weight: bold; }
#vc-inv .craftlabel { color: #5a4a2a; font-size: 12px; font-weight: bold; margin-bottom: -4px; }
#vc-inv .hints { color: #4a4a4a; font-size: 11px; line-height: 1.6; max-width: 430px; text-align: center;
  border-top: 2px solid #9a9a9a; padding-top: 8px; margin-top: 2px; }
#vc-inv .hints b { color: #2a4a1a; }
#vc-inv .craft { display: flex; align-items: center; gap: 14px; }
#vc-inv .grid { display: grid; gap: 2px; }
#vc-inv .arrow { font-size: 28px; color: #404040; }
#vc-inv .islot { width: 44px; height: 44px; position: relative; background: #8b8b8b; border: 2px solid #373737;
  box-shadow: inset 2px 2px 0 #565656; box-sizing: border-box; cursor: pointer; }
#vc-inv .islot:hover { background: #a0a0a0; }
#vc-inv .islot canvas { width: 36px; height: 36px; margin: 4px; image-rendering: pixelated; pointer-events: none; }
#vc-inv .islot .c { position: absolute; right: 3px; bottom: 1px; color: #fff; font-size: 14px; text-shadow: 1px 1px 0 #000; pointer-events: none; }
#vc-inv .rows { display: grid; grid-template-columns: repeat(9, 44px); gap: 2px; }
#vc-inv .hotrow { display: grid; grid-template-columns: repeat(9, 44px); gap: 2px; margin-top: 6px; }
#vc-held { position: fixed; width: 40px; height: 40px; pointer-events: none; z-index: 40; transform: translate(-50%, -50%); display: none; }
#vc-held canvas { width: 40px; height: 40px; image-rendering: pixelated; }
#vc-held .c { position: absolute; right: 0; bottom: -2px; color: #fff; font-size: 14px; text-shadow: 1px 1px 0 #000; }
#vc-tip { position: fixed; color: #fff; font-size: 12px; background: rgba(0,0,0,0.75); padding: 2px 6px; z-index: 41; pointer-events: none; display: none; }
`;

type SlotRef = { kind: 'inv' | 'craft' | 'out'; index: number };

export class InventoryScreen {
  private root: HTMLDivElement;
  private heldEl: HTMLDivElement;
  private tipEl: HTMLDivElement;
  private panel!: HTMLDivElement;
  private atlas: TextureAtlas;
  private inv: Inventory;
  private sound: SoundEngine;

  private cols: 2 | 3 = 2;
  private craft: (ItemStack | null)[] = [];
  private held: ItemStack | null = null;
  private slotEls = new Map<HTMLElement, SlotRef>();
  private mouseX = 0; private mouseY = 0;
  open = false;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, atlas: TextureAtlas, inv: Inventory, sound: SoundEngine) {
    this.atlas = atlas; this.inv = inv; this.sound = sound;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'vc-inv';
    parent.appendChild(this.root);
    this.heldEl = document.createElement('div'); this.heldEl.id = 'vc-held';
    parent.appendChild(this.heldEl);
    this.tipEl = document.createElement('div'); this.tipEl.id = 'vc-tip';
    parent.appendChild(this.tipEl);

    document.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.heldEl.style.left = `${e.clientX}px`;
      this.heldEl.style.top = `${e.clientY}px`;
    });
  }

  show(cols: 2 | 3): void {
    this.cols = cols;
    this.craft = new Array(cols * cols).fill(null);
    this.held = null;
    this.build();
    this.root.style.display = 'flex';
    this.open = true;
    this.renderAll();
  }

  hide(): void {
    // return craft + held items to inventory
    for (let i = 0; i < this.craft.length; i++) {
      const s = this.craft[i];
      if (s) { this.inv.add(s.id, s.count); this.craft[i] = null; }
    }
    if (this.held) { this.inv.add(this.held.id, this.held.count); this.held = null; }
    this.root.style.display = 'none';
    this.heldEl.style.display = 'none';
    this.tipEl.style.display = 'none';
    this.open = false;
    this.onClose?.();
  }

  private build(): void {
    this.root.innerHTML = '';
    this.slotEls.clear();
    this.panel = document.createElement('div');
    this.panel.className = 'panel';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = this.cols === 3 ? '⚒ Crafting Table (3×3)' : '⚒ Inventory & Crafting (2×2)';
    this.panel.appendChild(title);

    const craftLabel = document.createElement('div');
    craftLabel.className = 'craftlabel';
    craftLabel.textContent = 'Crafting — drag items into the grid, then take the result →';
    this.panel.appendChild(craftLabel);

    // crafting row: grid + arrow + output
    const craftRow = document.createElement('div');
    craftRow.className = 'craft';
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.gridTemplateColumns = `repeat(${this.cols}, 44px)`;
    for (let i = 0; i < this.cols * this.cols; i++) grid.appendChild(this.makeSlot({ kind: 'craft', index: i }));
    craftRow.appendChild(grid);
    const arrow = document.createElement('div'); arrow.className = 'arrow'; arrow.textContent = '→';
    craftRow.appendChild(arrow);
    craftRow.appendChild(this.makeSlot({ kind: 'out', index: 0 }));
    this.panel.appendChild(craftRow);

    // main inventory (slots 9..35)
    const rows = document.createElement('div');
    rows.className = 'rows';
    for (let i = 9; i < 36; i++) rows.appendChild(this.makeSlot({ kind: 'inv', index: i }));
    this.panel.appendChild(rows);

    // hotbar (slots 0..8)
    const hot = document.createElement('div');
    hot.className = 'hotrow';
    for (let i = 0; i < 9; i++) hot.appendChild(this.makeSlot({ kind: 'inv', index: i }));
    this.panel.appendChild(hot);

    // recipe hints
    const hints = document.createElement('div');
    hints.className = 'hints';
    hints.innerHTML = this.cols === 3
      ? '<b>Tools</b> (material = Planks / Cobblestone / Iron Ingot): <b>Pickaxe</b> = 3 mat top + 2 Sticks down middle · <b>Axe</b> = 2 mat + 1 mat&Stick + Stick · <b>Shovel</b> = 1 mat over 2 Sticks · <b>Sword</b> = 2 mat over 1 Stick (deals more damage)'
      : '<b>1 Log → 4 Planks</b> · <b>2 Planks → 4 Sticks</b> · <b>4 Planks → Crafting Table</b> · place the Table & right-click it for the 3×3 grid (tools + swords)';
    this.panel.appendChild(hints);

    this.root.appendChild(this.panel);
  }

  private makeSlot(ref: SlotRef): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'islot';
    this.slotEls.set(el, ref);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 0) this.onLeft(ref);
      else if (e.button === 2) this.onRight(ref);
      this.renderAll();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mouseenter', () => this.showTip(ref, el));
    el.addEventListener('mouseleave', () => { this.tipEl.style.display = 'none'; });
    return el;
  }

  // ---- slot data access ----
  private get(ref: SlotRef): ItemStack | null {
    if (ref.kind === 'inv') return this.inv.slots[ref.index];
    if (ref.kind === 'craft') return this.craft[ref.index];
    return this.outputStack();
  }
  private set(ref: SlotRef, stack: ItemStack | null): void {
    if (ref.kind === 'inv') this.inv.slots[ref.index] = stack;
    else if (ref.kind === 'craft') this.craft[ref.index] = stack;
  }

  private outputStack(): ItemStack | null {
    const ids = this.craft.map((s) => (s ? s.id : 0));
    const out = matchRecipe(ids, this.cols);
    return out ? { id: out.id, count: out.count } : null;
  }

  // ---- interactions ----
  private onLeft(ref: SlotRef): void {
    if (ref.kind === 'out') { this.craftOnce(true); return; }
    const slot = this.get(ref);
    if (this.held) {
      if (!slot) { this.set(ref, this.held); this.held = null; }
      else if (slot.id === this.held.id) {
        const max = itemDef(slot.id)?.maxStack ?? MAX_STACK;
        const move = Math.min(max - slot.count, this.held.count);
        slot.count += move; this.held.count -= move;
        if (this.held.count <= 0) this.held = null;
      } else { this.set(ref, this.held); this.held = slot; } // swap
    } else if (slot) {
      this.held = slot; this.set(ref, null);
    }
  }

  private onRight(ref: SlotRef): void {
    if (ref.kind === 'out') { this.craftOnce(true); return; }
    const slot = this.get(ref);
    if (this.held) {
      if (!slot) { this.set(ref, { id: this.held.id, count: 1 }); if (--this.held.count <= 0) this.held = null; }
      else if (slot.id === this.held.id) {
        const max = itemDef(slot.id)?.maxStack ?? MAX_STACK;
        if (slot.count < max) { slot.count++; if (--this.held.count <= 0) this.held = null; }
      }
    } else if (slot) {
      const half = Math.ceil(slot.count / 2);
      this.held = { id: slot.id, count: half };
      slot.count -= half;
      if (slot.count <= 0) this.set(ref, null);
    }
  }

  private craftOnce(toHeld: boolean): void {
    const out = this.outputStack();
    if (!out) return;
    if (toHeld) {
      if (!this.held) this.held = { id: out.id, count: out.count };
      else if (this.held.id === out.id) this.held.count += out.count;
      else return; // can't stack different item on cursor
    }
    // consume one of each non-empty input
    for (let i = 0; i < this.craft.length; i++) {
      const s = this.craft[i];
      if (s) { s.count--; if (s.count <= 0) this.craft[i] = null; }
    }
    this.sound.uiClick();
  }

  // ---- rendering ----
  private renderAll(): void {
    for (const [el, ref] of this.slotEls) this.renderSlot(el, this.get(ref));
    if (this.held) {
      this.heldEl.style.display = 'block';
      this.heldEl.innerHTML = '';
      this.heldEl.appendChild(this.icon(this.held.id));
      if (this.held.count > 1) { const c = document.createElement('span'); c.className = 'c'; c.textContent = String(this.held.count); this.heldEl.appendChild(c); }
      this.heldEl.style.left = `${this.mouseX}px`;
      this.heldEl.style.top = `${this.mouseY}px`;
    } else {
      this.heldEl.style.display = 'none';
    }
  }

  private renderSlot(el: HTMLElement, stack: ItemStack | null): void {
    el.innerHTML = '';
    if (!stack) return;
    el.appendChild(this.icon(stack.id));
    if (stack.count > 1) { const c = document.createElement('span'); c.className = 'c'; c.textContent = String(stack.count); el.appendChild(c); }
  }

  private icon(id: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rect = this.atlas.getTilePixelRect(itemTile(id));
    ctx.drawImage(this.atlas.canvas, rect.x, rect.y, 16, 16, 0, 0, 16, 16);
    return canvas;
  }

  private showTip(ref: SlotRef, el: HTMLElement): void {
    const stack = this.get(ref);
    if (!stack) { this.tipEl.style.display = 'none'; return; }
    this.tipEl.textContent = itemName(stack.id);
    const r = el.getBoundingClientRect();
    this.tipEl.style.left = `${r.right + 4}px`;
    this.tipEl.style.top = `${r.top}px`;
    this.tipEl.style.display = 'block';
  }
}
