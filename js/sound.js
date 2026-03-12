/**
 * sound.js - SoundManager
 * BGM・SE の再生管理、WakeLock、Page Visibility 対応
 *
 * 【主な機能】
 *  - BGM: BGM ファイルごとに専用の <audio> 要素を事前生成し src を固定する。
 *         切り替え時は src を変えず play()/pause() のみ呼ぶ → 再バッファリングなし・即時再生。
 *  - SE: Web Audio API（AudioBufferSourceNode）で低遅延再生
 *       AudioContext 未対応時は new Audio() でフォールバック
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
    this._seStart    = document.getElementById('se-start');
    this._seButton   = document.getElementById('se-button');
    this._seSuccess  = document.getElementById('se-success');
    this._seMiss     = document.getElementById('se-miss');

    this._currentBGMKey = null;   // 現在再生中の BGM キー
    this._bgmPaused     = false;  // タブ非表示時に一時停止した場合 true（BGM再開に使う）
    this._wakeLock      = null;   // WakeLock オブジェクト（スリープ防止）
    this._bgmVolume     = 0.75;   // BGM の音量（0.0 〜 1.0）
    this._seVolume      = 0.8;    // SE の音量（0.0 〜 1.0）
    this._muted         = false;  // ユーザーが明示的にミュートしているか
    this._activeSE      = {};     // 再生中の SE インスタンス（型ごとに追跡）

    // Web Audio API（SE の低遅延再生用）
    this._audioCtx   = null;  // AudioContext（ユーザー操作後に生成）
    this._seGainNode = null;  // SE 全体の音量制御ノード
    this._seBuffers  = {};    // デコード済み AudioBuffer のキャッシュ

    // BGM ごとに専用 <audio> 要素を生成して src を固定する。
    // src の切り替えを行わないことで再バッファリングによる遅延を防ぐ。
    this._bgmPlayers = {};
    for (const [key, src] of Object.entries(BGM_FILES)) {
      const audio = new Audio();
      audio.src     = src;
      audio.loop    = true;
      audio.preload = 'auto';
      audio.volume  = this._bgmVolume;
      this._bgmPlayers[key] = audio;
    }

    this._initVisibility();
    this._initBeforeUnload();
  }

  /** BGM 再生（同じ曲が既に再生中なら何もしない） */
  playBGM(key) {
    if (this._muted) return;
    if (!this._bgmPlayers[key]) return;
    if (this._currentBGMKey === key && !this._bgmPlayers[key].paused) return;

    // 再生中の別曲を停止
    if (this._currentBGMKey && this._currentBGMKey !== key) {
      const prev = this._bgmPlayers[this._currentBGMKey];
      prev.pause();
      prev.currentTime = 0;
    }

    this._currentBGMKey = key;
    const player = this._bgmPlayers[key];
    player.volume = this._bgmVolume;
    player.loop   = true;
    const p = player.play();
    if (p) p.catch(() => {});
  }

  /** BGM 停止 */
  stopBGM() {
    if (this._currentBGMKey) {
      const player = this._bgmPlayers[this._currentBGMKey];
      player.pause();
      player.currentTime = 0;
    }
    this._currentBGMKey = null;
    this._bgmPaused     = false;
  }

  /** BGM 一時停止 */
  pauseBGM() {
    if (!this._currentBGMKey) return;
    const player = this._bgmPlayers[this._currentBGMKey];
    if (!player.paused) {
      player.pause();
      this._bgmPaused = true;
    }
  }

  /** BGM 再開 */
  resumeBGM() {
    if (this._bgmPaused && this._currentBGMKey) {
      const p = this._bgmPlayers[this._currentBGMKey].play();
      if (p) p.catch(() => {});
      this._bgmPaused = false;
    }
  }

  /** オープニング曲をランダムに再生 */
  playRandomOpening() {
    const key = Math.random() < 0.5 ? 'opening1' : 'opening2';
    this.playBGM(key);
  }

  /**
   * SE 再生
   * デコード済み AudioBuffer があれば Web Audio API で即時再生（iOS Safari のラグ解消）。
   * AudioContext 未初期化またはデコード未完了の場合は new Audio() でフォールバック。
   */
  playSE(type) {
    if (this._muted) return;

    // Web Audio API パス（デコード済みバッファがある場合）
    if (this._audioCtx && this._seBuffers[type]) {
      // バックグラウンド復帰後などで suspended になっている場合は resume
      if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
      const source = this._audioCtx.createBufferSource();
      source.buffer = this._seBuffers[type];
      source.connect(this._seGainNode);
      source.start(0);
      return;
    }

    // フォールバック: new Audio()（AudioContext 未初期化 or デコード未完了時）
    let src = null;
    switch (type) {
      case 'start':   src = this._seStart?.src;   break;
      case 'button':  src = this._seButton?.src;  break;
      case 'success': src = this._seSuccess?.src; break;
      case 'miss':    src = this._seMiss?.src;    break;
    }
    if (!src) return;
    const prev = this._activeSE[type];
    if (prev) { prev.pause(); }
    const audio = new Audio(src);
    audio.volume = this._seVolume;
    this._activeSE[type] = audio;
    const p = audio.play();
    if (p) p.catch(() => {});
  }

  /**
   * Web Audio API を初期化して SE ファイルを事前デコードする。
   * 同時に全 BGM 要素の iOS ロックを解除する（play → pause を一括実行）。
   * iOS の制限により必ずユーザー操作のイベントハンドラ内から呼ぶこと。
   */
  initAudioContext() {
    // --- SE: Web Audio API 初期化 ---
    if (!this._audioCtx) {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this._seGainNode = this._audioCtx.createGain();
        this._seGainNode.gain.value = this._seVolume;
        this._seGainNode.connect(this._audioCtx.destination);
        this._decodeSEBuffers();
      } catch (e) {
        // Web Audio API 非対応環境では何もしない（new Audio() フォールバックで動作継続）
      }
    }

    // --- BGM: iOS Safari のオーディオロックを解除する ---
    // iOS では JS 生成の <audio> も初回再生にユーザー操作が必要。
    // ユーザー操作のコールバック内で play() を呼ぶことでロックが解除される。
    //
    // 【注意】競合状態の回避について
    // initAudioContext() の直後に goToTitle() → playBGM(key) が同期的に呼ばれる。
    // このため .then() が発火するのは playBGM() が _currentBGMKey をセットした後になる。
    // .then() 内で _currentBGMKey と key を比較し、再生中の曲は pause しないことで
    // 「unlock の pause が BGM を止めてしまう」競合を防ぐ。
    // また、unlock 中の音声ブリップを防ぐため volume=0 でサイレント再生する。
    for (const [key, player] of Object.entries(this._bgmPlayers)) {
      player.volume = 0;
      const p = player.play();
      if (p) p.then(() => {
        player.volume = this._bgmVolume;
        // 再生中の BGM だけは pause しない（競合防止）
        if (this._currentBGMKey !== key) {
          player.pause();
          player.currentTime = 0;
        }
      }).catch(() => {
        player.volume = this._bgmVolume;
      });
    }
  }

  /**
   * SE ファイルを fetch して AudioBuffer にデコードしキャッシュする
   * ローディング画面で既に HTTP キャッシュに入っているため fetch は高速
   */
  async _decodeSEBuffers() {
    const SE_FILES = {
      start:   this._seStart?.src,
      button:  this._seButton?.src,
      success: this._seSuccess?.src,
      miss:    this._seMiss?.src
    };
    await Promise.all(Object.entries(SE_FILES).map(async ([key, src]) => {
      if (!src) return;
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        this._seBuffers[key] = await this._audioCtx.decodeAudioData(buf);
      } catch (e) {
        // デコード失敗時はフォールバックが使われるため無視
      }
    }));
  }

  /** ミュート切り替え */
  toggleMute() {
    this._muted = !this._muted;
    for (const player of Object.values(this._bgmPlayers)) {
      player.muted = this._muted;
    }
    if (this._seGainNode) {
      this._seGainNode.gain.value = this._muted ? 0 : this._seVolume;
    }
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
