/**
 * loading.js - ローディング画面
 * 全アセット（画像・音声）をプリロードし、完了後タップ待ち
 */

const IMAGE_ASSETS = [
  'assets/images/poly.webp',
  'assets/images/haikei.webp',
  'assets/images/polytech_outside.webp',
  'assets/images/polytech_run.webp',
  'assets/images/ending_good.webp',
  'assets/images/ending_normal.webp',
  'assets/images/teacher1.webp',
  'assets/images/teacher1_happy.webp',
  'assets/images/teacher1_cry.webp',
  'assets/images/teacher2.webp',
  'assets/images/teacher2_happy.webp',
  'assets/images/teacher2_cry.webp',
  'assets/images/teacher3.webp',
  'assets/images/teacher3_happy.webp',
  'assets/images/teacher3_cry.webp',
  'assets/images/teacher4.webp',
  'assets/images/teacher4_happy.webp',
  'assets/images/teacher4_cry.webp',
  'assets/images/teacher5.webp',
  'assets/images/teacher5_happy.webp',
  'assets/images/teacher5_cry.webp'
];

const AUDIO_ASSETS = [
  'assets/sounds/opening1.mp3',
  'assets/sounds/opening2.mp3',
  'assets/sounds/name_input.mp3',
  'assets/sounds/introduction.mp3',
  'assets/sounds/quiz.mp3',
  'assets/sounds/clear.mp3',
  'assets/sounds/edit.mp3',
  'assets/sounds/ending_happy.mp3',
  'assets/sounds/ending_normal.mp3',
  'assets/sounds/team.mp3',
  'assets/sounds/push_start.mp3',
  'assets/sounds/push_button.mp3',
  'assets/sounds/push_success.mp3',
  'assets/sounds/push_miss.mp3'
];

class LoadingScreen {
  constructor(app) {
    this._app = app;
    this._el        = document.getElementById('screen-loading');
    this._msgEl     = document.getElementById('loading-message');
    this._barEl     = document.getElementById('loading-progress-bar');
    this._overlay   = document.getElementById('loading-tap-overlay');
    this._loaded    = false;
    this._onTap     = null;
  }

  show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._overlay.classList.add('hidden');
    this._startLoading();
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  /** 全アセット読み込み開始 */
  async _startLoading() {
    const total = IMAGE_ASSETS.length + AUDIO_ASSETS.length;
    let loaded  = 0;

    const updateProgress = () => {
      loaded++;
      const pct = Math.floor((loaded / total) * 100);
      this._barEl.style.width = pct + '%';
      if (pct >= 100) {
        this._msgEl.textContent = '読み込み完了！';
      }
    };

    // 画像プリロード
    const imgPromises = IMAGE_ASSETS.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { updateProgress(); resolve(); };
      img.onerror = () => { updateProgress(); resolve(); }; // 失敗しても続行
      img.src = src;
    }));

    // 音声プリロード（canplaythrough まで待機）
    const audPromises = AUDIO_ASSETS.map(src => new Promise(resolve => {
      const aud = new Audio();
      aud.preload = 'auto';
      const done = () => { updateProgress(); resolve(); };
      aud.addEventListener('canplaythrough', done, { once: true });
      aud.addEventListener('error', done, { once: true });
      // タイムアウト3秒でも続行
      setTimeout(done, 3000);
      aud.src = src;
    }));

    await Promise.all([...imgPromises, ...audPromises]);
    this._loaded = true;
    this._showTapOverlay();
  }

  /** 「タップしてスタート」オーバーレイ表示 */
  _showTapOverlay() {
    this._overlay.classList.remove('hidden');
    this._overlay.addEventListener('click', () => this._onStart(), { once: true });
    this._overlay.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onStart();
    }, { once: true, passive: false });
  }

  /** スタート処理 */
  _onStart() {
    if (!this._loaded) return;
    // 非PCなら全画面リクエスト
    if (!this._isPC()) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    this._app.sound.requestWakeLock();
    this._app.goToTitle();
  }

  _isPC() {
    return !(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }
}

export default LoadingScreen;
