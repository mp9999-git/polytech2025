/**
 * sound.js - SoundManager
 * BGM・SE の再生管理、WakeLock、Page Visibility 対応
 *
 * 【主な機能】
 *  - BGM: HTML の <audio> 要素を使ってループ再生
 *  - SE: Audio() を都度生成して多重再生に対応
 *  - WakeLock API: 画面スリープを防止（スマートフォン向け）
 *  - Page Visibility API: タブを非表示にした時に BGM を自動一時停止・復帰
 *
 * 【_bgmPaused と _muted の違い】
 *  - _bgmPaused: タブ非表示など「システム都合」で一時停止した状態（再表示時に自動再開）
 *  - _muted: ユーザーが明示的にミュートした状態（自動解除しない）
 */

const BGM_FILES = {
  opening1:      'assets/sounds/opening1.mp3',
  opening2:      'assets/sounds/opening2.mp3',
  name_input:    'assets/sounds/name_input.mp3',
  introduction:  'assets/sounds/introduction.mp3',
  quiz:          'assets/sounds/quiz.mp3',
  edit:          'assets/sounds/edit.mp3',
  clear:         'assets/sounds/clear.mp3',
  ending_happy:  'assets/sounds/ending_happy.mp3',
  ending_normal: 'assets/sounds/ending_normal.mp3',
  team:          'assets/sounds/team.mp3'
};

class SoundManager {
  constructor() {
    this._bgmPlayer  = document.getElementById('bgm-player');
    this._seStart    = document.getElementById('se-start');
    this._seButton   = document.getElementById('se-button');
    this._seSuccess  = document.getElementById('se-success');
    this._seMiss     = document.getElementById('se-miss');

    this._currentBGM  = null;   // 現在再生中の BGM ファイルパス
    this._bgmPaused   = false;  // タブ非表示時に一時停止した場合 true（BGM再開に使う）
    this._wakeLock    = null;   // WakeLock オブジェクト（スリープ防止）
    this._bgmVolume   = 0.75;  // BGM の音量（0.0 〜 1.0）
    this._seVolume    = 0.8;   // SE の音量（0.0 〜 1.0）
    this._muted       = false;  // ユーザーが明示的にミュートしているか

    if (this._bgmPlayer) {
      this._bgmPlayer.volume = this._bgmVolume;
      this._bgmPlayer.loop   = true;
    }

    this._initVisibility();
    this._initBeforeUnload();
  }

  /** BGM 再生（同じ曲なら再スタートしない） */
  playBGM(key) {
    if (this._muted) return;
    const src = BGM_FILES[key];
    if (!src) return;
    if (this._currentBGM === src && !this._bgmPlayer.paused) return;

    this._currentBGM = src;
    this._bgmPlayer.src = src;
    this._bgmPlayer.volume = this._bgmVolume;
    this._bgmPlayer.loop = true;
    const p = this._bgmPlayer.play();
    if (p) p.catch(() => {});
  }

  /** BGM 停止 */
  stopBGM() {
    this._bgmPlayer.pause();
    this._bgmPlayer.currentTime = 0;
    this._currentBGM = null;
  }

  /** BGM 一時停止 */
  pauseBGM() {
    if (!this._bgmPlayer.paused) {
      this._bgmPlayer.pause();
      this._bgmPaused = true;
    }
  }

  /** BGM 再開 */
  resumeBGM() {
    if (this._bgmPaused && this._currentBGM) {
      const p = this._bgmPlayer.play();
      if (p) p.catch(() => {});
      this._bgmPaused = false;
    }
  }

  /** オープニング曲をランダムに再生 */
  playRandomOpening() {
    const key = Math.random() < 0.5 ? 'opening1' : 'opening2';
    this.playBGM(key);
  }

  /** SE 再生 */
  playSE(type) {
    if (this._muted) return;
    let el = null;
    switch (type) {
      case 'start':   el = this._seStart;   break;
      case 'button':  el = this._seButton;  break;
      case 'success': el = this._seSuccess; break;
      case 'miss':    el = this._seMiss;    break;
    }
    if (!el) return;
    el.pause();
    el.volume = this._seVolume;
    el.currentTime = 0;
    const p = el.play();
    if (p) p.catch(() => {});
  }

  /** ミュート切り替え */
  toggleMute() {
    this._muted = !this._muted;
    this._bgmPlayer.muted = this._muted;
  }

  /** WakeLock リクエスト（スリープ防止） */
  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => {
        this._wakeLock = null;
      });
    } catch (e) {
      // WakeLock 非対応またはエラー時は無視
    }
  }

  /** WakeLock 解放 */
  async releaseWakeLock() {
    if (this._wakeLock) {
      await this._wakeLock.release();
      this._wakeLock = null;
    }
  }

  /** Page Visibility API: タブ非表示時にBGM停止 */
  _initVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseBGM();
        this.releaseWakeLock();
      } else {
        this.resumeBGM();
        this.requestWakeLock();
      }
    });
  }

  /** ページを閉じる・移動する時にBGM停止 */
  _initBeforeUnload() {
    window.addEventListener('pagehide', () => {
      this.stopBGM();
      this.releaseWakeLock();
    });
    window.addEventListener('beforeunload', () => {
      this.stopBGM();
    });
  }
}

export default SoundManager;
export { BGM_FILES };
