/**
 * loading.js - ローディング画面
 * 全アセット（画像・音声）をプリロードし、完了後モード選択待ち
 */

const IMAGE_ASSETS = [
  'assets/images/polytech_outside.webp',
  'assets/images/polytech_run.webp',
  'assets/images/poly.webp',
  'assets/images/haikei.webp',
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

const MODE2_IMAGE_ASSETS = [
  'assets/images2/poly.webp',
  'assets/images2/polytech_outside.webp',
  'assets/images2/haikei.webp',
  'assets/images2/polytech_run.webp',
  'assets/images2/ending_good.webp',
  'assets/images2/ending_normal.webp',
  'assets/images2/title.webp',
  'assets/images2/teacher1.webp',
  'assets/images2/teacher1_happy.webp',
  'assets/images2/teacher1_cry.webp',
  'assets/images2/teacher1_cry2.webp',
  'assets/images2/teacher1_ending.webp',
  'assets/images2/teacher2.webp',
  'assets/images2/teacher2_happy.webp',
  'assets/images2/teacher2_cry.webp',
  'assets/images2/teacher2_cry2.webp',
  'assets/images2/teacher2_ending.webp',
  'assets/images2/teacher3.webp',
  'assets/images2/teacher3_happy.webp',
  'assets/images2/teacher3_cry.webp',
  'assets/images2/teacher3_cry2.webp',
  'assets/images2/teacher3_ending.webp',
  'assets/images2/teacher4.webp',
  'assets/images2/teacher4_happy.webp',
  'assets/images2/teacher4_cry.webp',
  'assets/images2/teacher4_cry2.webp',
  'assets/images2/teacher4_ending.webp',
  'assets/images2/teacher5.webp',
  'assets/images2/teacher5_happy.webp',
  'assets/images2/teacher5_cry.webp',
  'assets/images2/teacher5_cry2.webp',
  'assets/images2/teacher5_ending.webp'
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

const DATA_ASSETS = [
  'assets/data/teacher_names.json',
  'assets/data/messages_story.json',
  'assets/data/messages_quiz.json',
  'assets/data/messages_quiz_clear.json',
  'assets/data/messages_ending.json',
  'assets/data/quiz_network.json',
  'assets/data/quiz_plc.json',
  'assets/data/quiz_database.json',
  'assets/data/quiz_java.json',
  'assets/data/quiz_android.json',
  'assets/data/developer_info.txt'
];

class LoadingScreen {
  constructor(app) {
    this._app = app;
    this._el        = document.getElementById('screen-loading');
    this._msgEl     = document.getElementById('loading-message');
    this._barEl     = document.getElementById('loading-progress-bar');
    this._overlay   = document.getElementById('loading-tap-overlay');
    this._loaded    = false;
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
    this._app.dataCache = {};
    const allImgs = [...IMAGE_ASSETS, ...MODE2_IMAGE_ASSETS];
    const total = allImgs.length + AUDIO_ASSETS.length + DATA_ASSETS.length;
    let loaded  = 0;

    const updateProgress = () => {
      loaded++;
      const pct = Math.floor((loaded / total) * 100);
      this._barEl.style.width = pct + '%';
      if (pct >= 100) {
        this._msgEl.textContent = '読み込み完了！';
      }
    };

    // 画像プリロード（Mode1 + Mode2 両方）
    const imgPromises = allImgs.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { updateProgress(); resolve(); };
      img.onerror = () => { updateProgress(); resolve(); }; // 失敗しても続行
      img.src = src;
    }));

    // 音声プリロード（canplaythrough まで待機）
    const audPromises = AUDIO_ASSETS.map(src => new Promise(resolve => {
      const aud = new Audio();
      aud.preload = 'auto';
      let settled = false;
      const done = () => { if (settled) return; settled = true; updateProgress(); resolve(); };
      aud.addEventListener('canplaythrough', done, { once: true });
      aud.addEventListener('error', done, { once: true });
      // タイムアウト3秒でも続行
      setTimeout(done, 3000);
      aud.src = src;
    }));

    // データプリロード（JSON/テキストをキャッシュ）
    const dataPromises = DATA_ASSETS.map(src => new Promise(resolve => {
      const isTxt = src.endsWith('.txt');
      fetch(src)
        .then(res => isTxt ? res.text() : res.json())
        .then(data => { this._app.dataCache[src] = data; })
        .catch(() => {}) // 失敗しても続行
        .finally(() => { updateProgress(); resolve(); });
    }));

    await Promise.all([...imgPromises, ...audPromises, ...dataPromises]);
    this._loaded = true;
    this._showModeSelect();
  }

  /** モード選択オーバーレイ表示 */
  _showModeSelect() {
    this._overlay.classList.remove('hidden');

    // iOS Safari判定：スタンドアロンモード未起動なら使用方法ヒントを表示
    if (this._isIOS() && !this._isStandalone()) {
      this._showIOSHint();
    }

    const btn1 = document.getElementById('btn-mode1');
    const btn2 = document.getElementById('btn-mode2');

    const onModeSelect = (mode) => {
      if (!this._loaded) return;
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
      this._app.state.gameMode = mode;
      this._app.saveState();
      this._app.sound.requestWakeLock();
      this._app.goToTitle();
    };

    // touchend: Android Chromeでフルスクリーンが最も確実に動作するイベント
    btn1.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); onModeSelect(1); }, { once: true, passive: false });
    btn2.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); onModeSelect(2); }, { once: true, passive: false });

    // click: PC/フォールバック向け
    btn1.addEventListener('click', (e) => { e.stopPropagation(); onModeSelect(1); }, { once: true });
    btn2.addEventListener('click', (e) => { e.stopPropagation(); onModeSelect(2); }, { once: true });
  }

  _isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (/Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }

  _isStandalone() {
    return window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
  }

  /** iOSでホーム画面追加を促すヒントを表示 */
  _showIOSHint() {
    const hint = document.getElementById('ios-hint');
    if (hint) hint.classList.remove('hidden');
  }
}

export default LoadingScreen;
