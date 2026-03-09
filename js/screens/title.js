/**
 * title.js - タイトル画面
 * ケンバーンズ効果の背景アニメーション、ボタン処理
 */

class TitleScreen {
  constructor(app) {
    this._app  = app;
    this._el   = document.getElementById('screen-title');
    this._bg   = document.getElementById('title-bg');
    this._animId = null;
    this._animStart = null;
    this._animDuration = 11400; // ms（8000ms / 0.7 ≈ 11400ms、70%速度）

    document.getElementById('btn-continue').addEventListener('click', () => {
      this._enterFullscreen();
      app.sound.playSE('button');
      app.continueGame();
    });

    document.getElementById('btn-newgame').addEventListener('click', () => {
      this._enterFullscreen();
      app.sound.playSE('start');
      app.newGame();
    });

    document.getElementById('btn-dev-team').addEventListener('click', () => {
      this._enterFullscreen();
      app.sound.playSE('button');
      app.goToDeveloper();
    });

    document.getElementById('btn-quiz-editor').addEventListener('click', () => {
      this._enterFullscreen();
      app.sound.playSE('button');
      app.goToQuizEditor();
    });

    document.getElementById('btn-music-test').addEventListener('click', () => {
      this._enterFullscreen();
      app.sound.playSE('button');
      app.goToMusicTest();
    });

    document.getElementById('btn-mode-select').addEventListener('click', () => {
      app.sound.playSE('button');
      app.goToModeSelect();
    });
  }

  _enterFullscreen() {
    this._app.tryFullscreen();
  }

  show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');

    // モードに応じた背景画像を設定（object-fit: cover で解像度差を吸収）
    this._bg.src = this._app.getImgPath('opening.webp');

    // Mode別タイトルオーバーレイ表示
    const overlay = document.getElementById('title-mode2-overlay');
    const titleText = document.getElementById('title-text');
    const mode = this._app.state.gameMode;
    if (mode === 2) {
      overlay.src = 'assets/images_sd/title.webp';
      overlay.classList.remove('hidden', 'mode1');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 1.5s ease';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
      titleText.style.visibility = 'hidden';
    } else if (mode === 1) {
      overlay.src = 'assets/images/title.webp';
      overlay.classList.remove('hidden');
      overlay.classList.add('mode1');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 1.5s ease';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
      titleText.style.visibility = 'hidden';
    } else {
      overlay.classList.add('hidden');
      overlay.classList.remove('mode1');
      overlay.src = '';
      titleText.style.visibility = 'visible';
    }

    this._startKenburns();
    // タイトルBGM: オープニング曲ランダム再生
    this._app.sound.playRandomOpening();
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
    this._stopKenburns();
    const overlay = document.getElementById('title-mode2-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('mode1');
    overlay.style.opacity = '0';
    document.getElementById('title-text').style.visibility = 'visible';
  }

  /** ケンバーンズエフェクト（ズーム+パン+フェードイン） */
  _startKenburns() {
    this._animStart = null;
    // フェードイン: opacity 0→1 で1.5s
    this._bg.style.opacity = 0;
    this._bg.style.transition = 'opacity 1.5s ease';
    requestAnimationFrame(() => {
      this._bg.style.opacity = 1;
    });
    this._loopKenburns();
  }

  _loopKenburns() {
    const animate = (ts) => {
      if (!this._animStart) this._animStart = ts;
      const elapsed  = ts - this._animStart;
      const progress = (elapsed % this._animDuration) / this._animDuration; // 0→1 ループ

      // スケール: cosで2π周期（ループ端で値一致→連続）1.0〜1.18
      const scale = 1.09 + Math.cos(progress * 2 * Math.PI) * 0.09;

      // パン: 2π周期（ループ端で連続）
      const panX = Math.sin(progress * 2 * Math.PI) * 25;
      const panY = Math.sin(progress * 2 * Math.PI + Math.PI * 0.5) * 12;

      this._bg.style.transform = `scale(${scale}) translate(${panX}px, ${panY}px)`;
      this._animId = requestAnimationFrame(animate);
    };
    this._animId = requestAnimationFrame(animate);
  }

  _stopKenburns() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
    if (this._bg) this._bg.style.transform = '';
  }
}

export default TitleScreen;
