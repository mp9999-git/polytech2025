/**
 * app.js - Polytech Memorial Web版 メインコントローラー
 * 画面遷移・状態管理・スケーリングを統括する
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

// ステージ順
const STAGE_ORDER = ['Network', 'PLC', 'Database', 'Java', 'Android'];

class App {
  constructor() {
    this.sound   = new SoundManager();
    this.state   = loadState();

    // ゲームコンテナ
    this._container = document.getElementById('game-container');
    this._wrapper   = document.getElementById('game-wrapper');

    // 画面インスタンス
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

    this._currentScreen = null;

    // スケーリング初期化
    this._initScaling();

    // 全画面解除時の対応
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
    // ローディング以外（エンディング等）からタイトルに戻る場合のフォールバック
    if (!this._isPC() && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    this._showScreen('title');
    this._screens.title.show();
  }

  _isPC() {
    return !(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }

  /** 新規ゲーム開始（全リセット） */
  newGame() {
    this.state = resetState();
    saveState(this.state);
    this._showToast('データをリセットしました');
    this._showScreen('nameInput');
    this._screens.nameInput.show();
  }

  /** つづきからゲーム再開 */
  continueGame() {
    if (!this.state.playerName) {
      this._showScreen('nameInput');
      this._screens.nameInput.show();
      return;
    }
    // 先生名が未設定（全てデフォルト）の場合は名前入力画面へ
    const allDefault = this.state.teacherNames.every((n, i) => n === `先生${i + 1}`);
    if (allDefault) {
      this._showScreen('nameInput');
      this._screens.nameInput.show();
      return;
    }
    // 全クリア済み（エンディング到達済み）の場合はエンディングへ
    if (this.state.allCleared) {
      this.goToEnding();
      return;
    }
    // 未クリアのステージを探す
    const nextStage = this._findNextStage();
    if (nextStage) {
      this.goToStory(nextStage);
    } else {
      this.goToEnding();
    }
  }

  /** 名前入力 → ストーリーへ */
  goToStory(category) {
    this._showScreen('story');
    this._screens.story.show(category);
  }

  /** クイズへ */
  goToQuiz(category) {
    this._showScreen('quiz');
    this._screens.quiz.show(category);
  }

  /** エンディングへ */
  goToEnding() {
    this._showScreen('ending');
    this._screens.ending.show();
  }

  /** 開発チームへ */
  goToDeveloper() {
    this._showScreen('developer');
    this._screens.developer.show();
  }

  /** 問題閲覧モードへ */
  goToQuizEditor() {
    this._showScreen('quizEditor');
    this._screens.quizEditor.show();
  }

  /** 音楽テストへ */
  goToMusicTest() {
    this._showScreen('musicTest');
    this._screens.musicTest.show();
  }

  /** 状態を保存 */
  saveState() {
    saveState(this.state);
  }

  // ---- private ----

  /** トーストメッセージを表示 */
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

  /** 指定画面に切り替え（他を非表示） */
  _showScreen(name) {
    if (this._currentScreen) {
      const prev = this._screens[this._currentScreen];
      if (prev && prev.hide) prev.hide();
    }
    this._currentScreen = name;
  }

  /** 未クリアの最初のステージを探す */
  _findNextStage() {
    for (const stage of STAGE_ORDER) {
      if (!this.state.progress[stage]?.cleared) return stage;
    }
    return null; // 全クリア
  }

  // ---- スケーリング ----

  _initScaling() {
    this._applyScale();
    // スケール適用後にフェードイン（初回レンダリングフラッシュ防止）
    requestAnimationFrame(() => { this._container.style.opacity = '1'; });
    window.addEventListener('resize', () => this._applyScale());
    screen.orientation?.addEventListener('change', () => this._applyScale());
  }

  _applyScale() {
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const scaleX = vw / 1920;
    const scaleY = vh / 1080;
    const scale  = Math.min(scaleX, scaleY);

    const scaledW = 1920 * scale;
    const scaledH = 1080 * scale;
    const left    = (vw - scaledW) / 2;
    const top     = (vh - scaledH) / 2;

    this._container.style.transform = `scale(${scale})`;
    this._container.style.left      = `${left}px`;
    this._container.style.top       = `${top}px`;
    this._container.style.position  = 'absolute';

    // スケール後のサイズが画面より小さい場合はスクロール可能に
    if (scaledH < vh) {
      this._wrapper.style.overflowY = 'auto';
    } else {
      this._wrapper.style.overflowY = 'hidden';
    }

    // 紙吹雪Canvasのリサイズ
    const confettiCanvas = document.getElementById('confetti-canvas');
    if (confettiCanvas) {
      confettiCanvas.width  = 1920 * 0.45;
      confettiCanvas.height = 1080;
    }
    const endingCanvas = document.getElementById('ending-confetti-canvas');
    if (endingCanvas) {
      endingCanvas.width  = 1920;
      endingCanvas.height = 1080;
    }
  }

  _onFullscreenChange() {
    this._applyScale();
  }
}

// ── エントリポイント ──────────────────────────────────
const app = new App();
app.start();

export default app;
