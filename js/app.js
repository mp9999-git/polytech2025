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

    // 全画面モードが解除されたときにスケールを再計算
    document.addEventListener('fullscreenchange', () => this._onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this._onFullscreenChange());
  }

  /** アプリ開始 */
  start() {
    this._showScreen('loading');
    this._screens.loading.show();
  }

  /** ローディング完了 → タイトルへ */
  goToTitle() {
    // スマートフォン等で全画面になっていない場合は全画面リクエスト
    if (!this._isPC() && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    this._showScreen('title');
    this._screens.title.show();
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
   * Mode 2（SDゲームモード）  → assets/images2/
   */
  getImgPath(filename) {
    const folder = this.state.gameMode === 2 ? 'assets/images2' : 'assets/images';
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
  }

  /**
   * ゲームコンテナを画面サイズに合わせてスケーリングする
   * 基準解像度 1920x1080 を維持したまま、アスペクト比を保って拡縮する（レターボックス方式）
   */
  _applyScale() {
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
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
