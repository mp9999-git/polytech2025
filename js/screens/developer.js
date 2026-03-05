/**
 * developer.js - 開発チーム画面
 * カード型UIで開発情報を表示、team.mp3 をBGMとして再生
 * パーティクルエフェクト付き宇宙テーマ
 */

class DeveloperScreen {
  constructor(app) {
    this._app     = app;
    this._el      = document.getElementById('screen-developer');
    this._textEl  = document.getElementById('dev-text');
    this._backBtn = document.getElementById('dev-back-btn');
    this._canvas  = document.getElementById('dev-particles');
    this._ctx     = this._canvas ? this._canvas.getContext('2d') : null;
    this._particles = [];
    this._animId  = null;
    this._loaded  = false;

    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      this._app.goToTitle();
    });
  }

  async show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._app.sound.playBGM('team');

    // モードに応じた背景画像を設定
    const devBg = document.getElementById('dev-bg');
    if (devBg) {
      devBg.style.backgroundImage = `url('${this._app.getImgPath('polytech_outside.webp')}')`;
    }

    // スクロール位置をトップに戻す
    const content = document.getElementById('dev-content');
    if (content) content.scrollTop = 0;

    // 詳細テキストを読み込んで表示（初回のみfetch、キャッシュ優先）
    if (!this._loaded) {
      const cached = this._app.dataCache?.['assets/data/developer_info.txt'];
      if (cached) {
        if (this._textEl) this._textEl.textContent = cached;
        this._loaded = true;
      } else {
        try {
          const res  = await fetch('assets/data/developer_info.txt');
          const text = await res.text();
          if (this._textEl) this._textEl.textContent = text;
          this._loaded = true;
        } catch {
          if (this._textEl) this._textEl.textContent = '情報の読み込みに失敗しました。';
        }
      }
    }

    this._startParticles();
  }

  hide() {
    this._stopParticles();
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  // ---- パーティクルエフェクト（流れ星風） ----

  _startParticles() {
    if (!this._canvas || !this._ctx) return;

    // ゲームコンテナのサイズに合わせる
    const gc = document.getElementById('game-container');
    const w  = gc ? gc.offsetWidth  || 1920 : 1920;
    const h  = gc ? gc.offsetHeight || 1080 : 1080;
    this._canvas.width  = w;
    this._canvas.height = h;

    // 星を初期化
    this._particles = [];
    for (let i = 0; i < 80; i++) {
      this._particles.push(this._newStar(w, h, true));
    }

    const tick = () => {
      this._drawParticles(w, h);
      this._animId = requestAnimationFrame(tick);
    };
    this._animId = requestAnimationFrame(tick);
  }

  _stopParticles() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
    if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
  }

  _newStar(w, h, randomY = false) {
    return {
      x:    Math.random() * w,
      y:    randomY ? Math.random() * h : -4,
      vx:   (Math.random() - 0.5) * 0.4,
      vy:   0.3 + Math.random() * 0.8,
      r:    0.5 + Math.random() * 2,
      a:    0.4 + Math.random() * 0.6,
      // ほんのり青白く光る
      hue:  190 + Math.floor(Math.random() * 40),
    };
  }

  _drawParticles(w, h) {
    const ctx = this._ctx;
    // 残像を残すため半透明で塗りつぶす
    ctx.fillStyle = 'rgba(2, 8, 24, 0.18)';
    ctx.fillRect(0, 0, w, h);

    for (let i = this._particles.length - 1; i >= 0; i--) {
      const s = this._particles[i];
      s.x += s.vx;
      s.y += s.vy;

      // 画面外に出たら再生成
      if (s.y > h + 4) {
        this._particles[i] = this._newStar(w, h);
        continue;
      }

      // グロー描画
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      grad.addColorStop(0, `hsla(${s.hue}, 100%, 95%, ${s.a})`);
      grad.addColorStop(1, `hsla(${s.hue}, 80%, 70%, 0)`);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
}

export default DeveloperScreen;
