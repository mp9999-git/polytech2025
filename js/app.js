/**
 * app.js - Polytech Memorial Web版 メインコントローラー
 * 画面遷移・状態管理・スケーリングを統括する
 *
 * 【全体の流れ】
 *  App コンストラクタ
 *   → SoundManager・state の初期化
 *   → 各画面クラスのインスタンスを生成
 *   → スケーリング設定
 *  start()
 *   → LoadingScreen を表示（アセット読み込み）
 *   → 完了後 goToTitle() が呼ばれタイトル画面へ
 */

import SoundManager       from './sound.js';
import { loadState, saveState, resetState } from './storage.js';
import LoadingScreen      from './screens/loading.js';
import TitleScreen        from './screens/title.js';
import NameInputScreen    from './screens/nameInput.js';
import StoryScreen        from './screens/story.js';
import QuizScreen         from './screens/quiz.js';
import EndingScreen       from './screens/ending.js';
import DeveloperScreen    from './screens/developer.js';
import QuizEditorScreen   from './screens/quizEditor.js';
import MusicTestScreen    from './screens/musicTest.js';
import SplashScreen      from './screens/splash.js';

// ステージをクリアする順番（この順でストーリー→クイズが進む）
const STAGE_ORDER = ['Network', 'PLC', 'Database', 'Java', 'Android'];

class App {
  constructor() {
    // サウンドマネージャー（BGM・SE の再生管理）
    this.sound   = new SoundManager();
    // ゲーム状態（LocalStorage からロード）
    this.state   = loadState();

    // ゲームコンテナ（1920x1080 固定サイズの描画領域）
    this._container = document.getElementById('game-container');
    // ラッパー（スクロール制御用の外枠）
    this._wrapper   = document.getElementById('game-wrapper');

    // 各画面クラスのインスタンスを生成して登録
    this._screens = {
      splash:     new SplashScreen(this),
      loading:    new LoadingScreen(this),
      title:      new TitleScreen(this),
      nameInput:  new NameInputScreen(this),
      story:      new StoryScreen(this),
      quiz:       new QuizScreen(this),
      ending:     new EndingScreen(this),
      developer:  new DeveloperScreen(this),
      quizEditor: new QuizEditorScreen(this),
      musicTest:  new MusicTestScreen(this)
    };

    // 現在表示中の画面名（初期値はなし）
    this._currentScreen = null;

    // スケーリング初期化（ウィンドウサイズに合わせて拡縮）
    this._initScaling();

    // スワイプ・ピンチをタップと誤認識しないようフィルタリング
    this._initGestureFilter();

    // 全画面モードが解除されたときにスケールを再計算
    document.addEventListener('fullscreenchange', () => this._onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this._onFullscreenChange());
  }

  /** アプリ開始 */
  start() {
    this._showScreen('splash');
    this._screens.splash.show();
  }

  /** スプラッシュ → ローディング画面へ */
  goToLoading() {
    this._showScreen('loading');
    this._screens.loading.show();
  }

  /** ローディング完了 → タイトルへ */
  goToTitle() {
    this.tryFullscreen();
    this._showScreen('title');
    this._screens.title.show();
  }

  /**
   * PC 以外のデバイスで全画面リクエストを行う共通メソッド
   * fullscreen API はユーザー操作ハンドラ内から呼ぶ必要があるため
   * 各呼び出し元はそのまま残し、実装だけここに集約する
   */
  tryFullscreen() {
    if (this._isPC()) return;
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
  }

  /**
   * PC（デスクトップ）かどうかを UserAgent で判定する
   * スマートフォン・タブレット系のキーワードが含まれていなければ PC とみなす
   */
  _isPC() {
    return !(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }

  /**
   * 新規ゲーム開始（プレイデータを全リセット）
   * gameMode（乙女/SDモード）はリセット後も保持する
   */
  newGame() {
    const savedMode = this.state.gameMode; // モードを退避
    this.state = resetState();             // 全データをリセット
    this.state.gameMode = savedMode;       // モードを復元
    saveState(this.state);
    this._showToast('データをリセットしました');
    this._showScreen('nameInput');
    this._screens.nameInput.show();
  }

  /** つづきからゲーム再開 */
  continueGame() {
    // プレイヤー名が未設定なら名前入力へ
    if (!this.state.playerName) {
      this._showScreen('nameInput');
      this._screens.nameInput.show();
      return;
    }
    // 先生名が全てデフォルト（「先生1」〜「先生5」）の場合も名前入力へ
    const allDefault = this.state.teacherNames.every((n, i) => n === `先生${i + 1}`);
    if (allDefault) {
      this._showScreen('nameInput');
      this._screens.nameInput.show();
      return;
    }
    // 全ステージクリア済みならエンディングへ
    if (this.state.allCleared) {
      this.goToEnding();
      return;
    }
    // 未クリアのステージを探して再開
    const nextStage = this._findNextStage();
    if (nextStage) {
      this.goToStory(nextStage);
    } else {
      this.goToEnding();
    }
  }

  /** ストーリー画面へ（category: 'Network' など） */
  goToStory(category) {
    this._showScreen('story');
    this._screens.story.show(category);
  }

  /** クイズ画面へ */
  goToQuiz(category) {
    this._showScreen('quiz');
    this._screens.quiz.show(category);
  }

  /** エンディング画面へ */
  goToEnding() {
    this._showScreen('ending');
    this._screens.ending.show();
  }

  /** 開発チーム画面へ */
  goToDeveloper() {
    this._showScreen('developer');
    this._screens.developer.show();
  }

  /** 問題閲覧モードへ */
  goToQuizEditor() {
    this._showScreen('quizEditor');
    this._screens.quizEditor.show();
  }

  /** 音楽テスト画面へ */
  goToMusicTest() {
    this._showScreen('musicTest');
    this._screens.musicTest.show();
  }

  /** タイトル → モード選択オーバーレイへ戻る */
  goToModeSelect() {
    this._showScreen('loading');
    this._screens.loading.showModeSelect();
  }

  /** ゲーム状態を LocalStorage に保存 */
  saveState() {
    saveState(this.state);
  }

  /**
   * モードに応じた画像ファイルのパスを返す
   * Mode 1（乙女ゲームモード）→ assets/images/
   * Mode 2（SDゲームモード）  → assets/images_sd/
   */
  getImgPath(filename) {
    const folder = this.state.gameMode === 2 ? 'assets/images_sd' : 'assets/images';
    return `${folder}/${filename}`;
  }

  // ---- private ----

  /**
   * 画面下部に一時的なトーストメッセージを表示する
   * 2秒後にフェードアウトして非表示になる
   */
  _showToast(message) {
    const toast = document.getElementById('game-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden', 'toast-hide');
    toast.classList.add('toast-show');
    setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      setTimeout(() => toast.classList.add('hidden'), 500);
    }, 2000);
  }

  /**
   * 指定した画面に切り替える
   * 現在の画面があれば hide() を呼んで非表示にする
   */
  _showScreen(name) {
    if (this._currentScreen) {
      const prev = this._screens[this._currentScreen];
      if (prev && prev.hide) prev.hide();
    }
    this._currentScreen = name;
  }

  /**
   * STAGE_ORDER の順で未クリアの最初のステージを返す
   * 全クリア済みの場合は null を返す
   */
  _findNextStage() {
    for (const stage of STAGE_ORDER) {
      if (!this.state.progress[stage]?.cleared) return stage;
    }
    return null; // 全クリア
  }

  // ---- ジェスチャーフィルター ----

  /**
   * スワイプ・ピンチ操作をタップ/ボタン操作として誤認識しないようにする
   * touchstart で起点を記録し、touchmove で移動量やタッチ本数を監視する
   * 閾値（10px）を超えるか複数タッチが検出された場合は
   * キャプチャフェーズで touchend を止め、後続の click 合成も抑制する
   */
  _initGestureFilter() {
    const THRESHOLD = 10; // px: この距離以上動いたらスワイプとみなす
    let startX       = 0;
    let startY       = 0;
    let startTouches = 0;
    let blockEnd     = false;

    document.addEventListener('touchstart', (e) => {
      blockEnd     = false;
      startX       = e.touches[0].clientX;
      startY       = e.touches[0].clientY;
      startTouches = e.touches.length;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      // ピンチ（複数タッチ）: ブラウザのズーム動作を抑止
      if (e.touches.length >= 2) {
        e.preventDefault();
        blockEnd = true;
        return;
      }
      if (startTouches > 1) {
        blockEnd = true;
        return;
      }
      // 移動量が閾値を超えたらスワイプとみなす
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > THRESHOLD || dy > THRESHOLD) blockEnd = true;
    }, { passive: false }); // passive: false でピンチズームの preventDefault を有効化

    // キャプチャフェーズで捕捉 → ボタン等のリスナーより先に実行
    document.addEventListener('touchend', (e) => {
      if (blockEnd) {
        e.preventDefault();         // click の合成を抑制
        e.stopImmediatePropagation(); // 後続リスナーをすべて止める
        blockEnd = false;
      }
    }, { passive: false, capture: true });
  }

  // ---- スケーリング ----

  /**
   * ウィンドウリサイズ・画面回転に対応してスケーリングを初期化する
   * screen.orientation API が使えない古いブラウザは
   * window の orientationchange イベントでフォールバックする
   */
  _initScaling() {
    this._applyScale();
    window.addEventListener('resize', () => this._applyScale());
    // モダンブラウザ（Chrome/Firefox等）
    if (screen.orientation?.addEventListener) {
      screen.orientation.addEventListener('change', () => this._applyScale());
    } else {
      // 旧Android等のフォールバック
      window.addEventListener('orientationchange', () => this._applyScale());
    }
    // ピンチズーム発生時も即座に補正（iOS 13+ / Chrome 61+）
    // resize だけでは拾えない visualViewport の変化に対応
    if (window.visualViewport) {
      // scale が変化した場合のみ補正する（ピンチズーム）
      // scale 変化なし = ソフトキーボード起因のリサイズ → スキップ
      // （キーボード起因は window.resize が対応し、INPUT フォーカスガードが機能する）
      let _lastVvScale = 1;
      window.visualViewport.addEventListener('resize', () => {
        const s = window.visualViewport.scale;
        if (Math.abs(s - _lastVvScale) > 0.01) {
          _lastVvScale = s;
          this._applyScale();
        }
      });
      window.visualViewport.addEventListener('scroll', () => this._applyScale());
    }
  }

  /**
   * ゲームコンテナを画面サイズに合わせてスケーリングする
   * 基準解像度 1920x1080 を維持したまま、アスペクト比を保って拡縮する（レターボックス方式）
   */
  _applyScale() {
    // ソフトキーボード表示中（input/textarea フォーカス中）はスキップ
    // → resize イベントで transform が変わるとキーボードが即閉じる問題を防ぐ
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    // visualViewport が使える場合はズーム後の実際のサイズを取得
    // （ピンチズーム時に window.innerWidth/Height はズームを反映しないため）
    const vw     = window.visualViewport?.width  ?? window.innerWidth;
    const vh     = window.visualViewport?.height ?? window.innerHeight;
    // 横方向・縦方向それぞれの倍率を計算
    const scaleX = vw / 1920;
    const scaleY = vh / 1080;
    // 小さい方に合わせることで画面からはみ出さないようにする
    const scale  = Math.min(scaleX, scaleY);

    // スケール後の実際の描画サイズを計算
    const scaledW = 1920 * scale;
    const scaledH = 1080 * scale;
    // 画面中央に配置するためのオフセット
    const left    = (vw - scaledW) / 2;
    const top     = (vh - scaledH) / 2;

    // CSS transform でスケーリング・位置調整
    this._container.style.transform = `scale(${scale})`;
    this._container.style.left      = `${left}px`;
    this._container.style.top       = `${top}px`;
    this._container.style.position  = 'absolute';

    // スケール後のコンテナが画面より小さい場合はスクロール可能にする
    if (scaledH < vh) {
      this._wrapper.style.overflowY = 'auto';
    } else {
      this._wrapper.style.overflowY = 'hidden';
    }

    // 紙吹雪 Canvas のサイズを更新（クイズ画面用：左45%に表示）
    const confettiCanvas = document.getElementById('confetti-canvas');
    if (confettiCanvas) {
      confettiCanvas.width  = 1920 * 0.45;
      confettiCanvas.height = 1080;
    }
    // エンディング画面用の紙吹雪 Canvas（全画面）
    const endingCanvas = document.getElementById('ending-confetti-canvas');
    if (endingCanvas) {
      endingCanvas.width  = 1920;
      endingCanvas.height = 1080;
    }
  }

  /** 全画面モードの変更時にスケールを再計算 */
  _onFullscreenChange() {
    this._applyScale();
  }
}

// ── エントリポイント ──────────────────────────────────
// HTML 読み込み完了後にこのスクリプトが実行される（type="module" のため自動的に defer 扱い）
const app = new App();
app.start();

export default app;
