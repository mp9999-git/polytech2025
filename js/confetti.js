/**
 * confetti.js - 紙吹雪パーティクルエンジン
 * Canvas要素に120個のパーティクルを描画する
 */

const COLORS = [
  '#FF69B4', '#FF8C00', '#FFD700',
  '#7CFC00', '#00BFFF', '#9370DB',
  '#FFFFFF', '#FF4500', '#00CED1'
];
const PARTICLE_COUNT = 120;

class Confetti {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._particles = [];
    this._animId  = null;
    this._running = false;
    this._resize();
  }

  _resize() {
    // Canvasのサイズは属性値（width/height）を使用（CSSピクセルではなくCanvas座標系）
    // app.jsで明示的に設定しているのでそのまま使う
    // 未設定の場合はデフォルト値
    if (!this._canvas.width  || this._canvas.width  < 100) this._canvas.width  = 864;
    if (!this._canvas.height || this._canvas.height < 100) this._canvas.height = 1080;
  }

  _createParticle() {
    const w = this._canvas.width;
    return {
      x:          Math.random() * w,
      y:          Math.random() * -100,
      vx:         (Math.random() - 0.5) * 4,
      vy:         3 + Math.random() * 4,
      width:      12 + Math.random() * 20,
      height:     8  + Math.random() * 16,
      rotation:   Math.random() * 360,
      rotSpeed:   (Math.random() - 0.5) * 12,
      wobble:     Math.random() * Math.PI * 2,
      wobbleSpd:  0.05 + Math.random() * 0.05,
      color:      COLORS[Math.floor(Math.random() * COLORS.length)],
      isEllipse:  Math.random() < 0.4
    };
  }

  /** パーティクルを初期化して開始 */
  start() {
    this._canvas.style.display = 'block';
    this._resize();
    this._particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const p = this._createParticle();
      p.y = Math.random() * this._canvas.height; // 最初から画面内に分散
      return p;
    });
    if (!this._running) {
      this._running = true;
      this._loop();
    }
  }

  /** 停止して非表示 */
  stop() {
    this._running = false;
    if (this._animId) cancelAnimationFrame(this._animId);
    this._animId = null;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._canvas.style.display = 'none';
  }

  _loop() {
    if (!this._running) return;
    const ctx  = this._ctx;
    const w    = this._canvas.width;
    const h    = this._canvas.height;

    ctx.clearRect(0, 0, w, h);

    for (const p of this._particles) {
      p.wobble   += p.wobbleSpd;
      p.x        += p.vx + Math.sin(p.wobble) * 1.5;
      p.y        += p.vy;
      p.rotation += p.rotSpeed;

      // 画面外に出たら上端から再生成
      if (p.y > h + 30) {
        p.x         = Math.random() * w;
        p.y         = -30;
        p.vx        = (Math.random() - 0.5) * 4;
        p.vy        = 3 + Math.random() * 4;
        p.color     = COLORS[Math.floor(Math.random() * COLORS.length)];
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.isEllipse) {
        ctx.ellipse(0, 0, p.width / 2, p.height / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.rect(-p.width / 2, -p.height / 2, p.width, p.height);
      }
      ctx.fill();
      ctx.restore();
    }

    this._animId = requestAnimationFrame(() => this._loop());
  }
}

export default Confetti;
