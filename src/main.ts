import { Game } from './Game';

const app = document.getElementById('app')!;
const game = new Game(app, 'voxelcraft');
game.start();
(window as unknown as { game: Game }).game = game; // debug handle

// Title / click-to-play overlay.
const overlay = document.createElement('div');
overlay.id = 'vc-title';
overlay.innerHTML = `
  <div class="vc-title-card">
    <h1>VOXELCRAFT</h1>
    <p>A blocky sandbox in your browser</p>
    <button id="vc-play">Click to Play</button>
    <div class="vc-controls">Arrows / WASD move · Mouse look · Space jump · hold L-click mine · R-click place<br>1–9 blocks · <b>E = inventory + crafting</b> · V view · F fly · F5 = new world</div>
  </div>`;
const style = document.createElement('style');
style.textContent = `
  body { margin: 0; overflow: hidden; background: #87ceeb; font-family: monospace; }
  #vc-title { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 30%, rgba(8,16,34,0.10), rgba(4,8,22,0.55)); z-index: 50; color: #fff; }
  .vc-title-card { text-align: center; background: rgba(8,14,28,0.42); padding: 40px 64px;
    border: 2px solid rgba(255,255,255,0.12); border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
  .vc-title-card h1 { font-size: 64px; margin: 0 0 6px; letter-spacing: 6px;
    text-shadow: 4px 4px 0 #1b3a1b, 0 0 18px rgba(0,0,0,0.6); color: #c8f08a; }
  .vc-title-card p { margin: 0 0 28px; color: #e8f4ff; font-size: 16px; text-shadow: 1px 1px 2px #000; }
  #vc-play { font-family: monospace; font-size: 20px; padding: 12px 36px; cursor: pointer;
    color: #fff; background: #6a9a3a; border: 3px solid #20300f; box-shadow: 0 4px 0 #20300f;
    text-shadow: 1px 1px 0 #20300f; }
  #vc-play:hover { background: #79ab44; }
  #vc-play:active { transform: translateY(3px); box-shadow: 0 1px 0 #20300f; }
  .vc-controls { margin-top: 26px; color: #cfe6ff; font-size: 12px; }
`;
document.head.appendChild(style);
app.appendChild(overlay);

overlay.querySelector('#vc-play')!.addEventListener('click', () => {
  overlay.remove();
  game.onPlay(); // ends the intro, enables audio, and locks the pointer
});
