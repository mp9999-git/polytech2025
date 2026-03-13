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

    // Mode別タイトルオーバーレイ表示
    const overlay = document.getElementById('title-mode2-overlay');
    overlay.onload = null; // 前回の遅延 onload をキャンセル
    const titleText = document.getElementById('title-text');
    const mode = this._app.state.gameMode;

    // 背景画像: Mode1はopening1/opening2からランダム、他はopening.webp
    const bgName = (mode === 1)
      ? `opening${Math.floor(Math.random() * 2) + 1}.webp`
      : 'opening.webp';
    this._bg.src = this._app.getImgPath(bgName);

    const logoPanel = document.getElementById('title-logo-panel');

    if (mode === 2) {
      overlay.src = 'assets/images_sd/title.webp';
      overlay.classList.remove('hidden', 'mode1');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 1.5s ease';
      // 二重 rAF: opacity:0 が確実に描画されてから 1 に変更する
      requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity = '1'; }));
      titleText.style.visibility = 'hidden';
      logoPanel.classList.add('hidden');
    } else if (mode === 1) {
      // title1〜title5からランダム選択
      const titleNum = Math.floor(Math.random() * 5) + 1;
      overlay.src = `assets/images/title${titleNum}.webp`;
      overlay.classList.remove('hidden');
      overlay.classList.add('mode1');
      overlay.style.transition = 'none';
      overlay.style.opacity = '0';
      titleText.style.visibility = 'hidden';

      // 画像ロード後にパネルサイズを画像に合わせて設定
      const PAD = 32; // 上下パディング(px)
      const syncPanel = () => {
        const imgTop  = overlay.offsetTop;
        const imgH    = overlay.offsetHeight;
        logoPanel.style.top    = `${imgTop - PAD}px`;
        logoPanel.style.height = `${imgH + PAD * 2}px`;

        logoPanel.style.transition = 'none';
        logoPanel.classList.remove('hidden');
        logoPanel.style.opacity = '0';
        overlay.style.opacity   = '0';

        // transition 復元後に opacity:1 → フェードイン
        // setTimeout でブラウザが opacity:0 を確実にペイントしてから発火させる
        setTimeout(() => {
          overlay.style.transition   = 'opacity 1.5s ease';
          logoPanel.style.transition = 'opacity 1.5s ease';
          requestAnimationFrame(() => {
            overlay.style.opacity   = '1';
            logoPanel.style.opacity = '1';
          });
        }, 32);
      };
      // キャッシュ済みでも rAF で1フレーム遅らせてレイアウト確定後に実行
      if (overlay.complete && overlay.naturalHeight > 0) {
        requestAnimationFrame(syncPanel);
      } else {
        overlay.onload = syncPanel;
      }
    } else {
      overlay.classList.add('hidden');
      overlay.classList.remove('mode1');
      overlay.src = '';
      titleText.style.visibility = 'visible';
      logoPanel.classList.add('hidden');
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
    overlay.onload = null; // 遅延 onload をキャンセル
    overlay.classList.add('hidden');
    overlay.classList.remove('mode1');
    overlay.style.opacity = '0';
    document.getElementById('title-text').style.visibility = 'visible';
    document.getElementById('title-logo-panel').classList.add('hidden');
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
