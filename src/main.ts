import { GameApp } from './core/GameApp';
import { ViewportAdapter } from './render/ViewportAdapter';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const container = document.getElementById('game-container') as HTMLElement;

  if (!canvas || !container) {
    console.error('[Main] Canvas or container element not found!');
    return;
  }

  // 視口自適應縮放
  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    ViewportAdapter.fitCanvas(canvas, w, h);
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // 啟動遊戲應用程式
  const app = new GameApp(canvas);
  await app.init();
});
