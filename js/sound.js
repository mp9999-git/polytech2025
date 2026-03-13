/**
 * sound.js - SoundManager
 * BGM・SE の再生管理、WakeLock、Page Visibility 対応
 *
 * 【BGM 再生方式】
 *  Web Audio API（AudioBufferSourceNode）を使用。
 *  fetch + decodeAudioData で MP3 を PCM デコードし AudioBuffer に保存後、即時再生。
 *  HTTP キャッシュはローディング画面の fetch().blob() で先行充填されているため、
 *  ジェスチャー後の fetch はキャッシュヒットし、decodeAudioData のみ待てばよい。
 *
 * 【デコードタイミング】
 *  Phase1（initAudioContext 直後）: opening1/opening2 を最優先でデコード開始。
 *  Phase2（モード選択画面）: name_input→introduction→quiz→clear→ending_happy→ending_normal
 *  オンデマンド（playBGM 呼び出し時）: team, edit
 *
 * 【_bgmPaused と _muted の違い】
 *  - _bgmPaused: タブ非表示など「システム都合」で一時停止した状態（再表示時に自動再開）
 *  - _muted: ユーザーが明示的にミュートした状態（自動解除しない）
 *
 * 【iOS Safari の制限と対策】
 *  AudioContext はユーザー操作後（initAudioContext）に生成する。
 *  生成直後に fetch + decodeAudioData を開始し、モード選択→タイトル画面への
 *  フェード遷移（~250ms）の間にデコードを完了させることで即時再生を実現する。
 *  HTMLAudioElement の preload='auto' が iOS では無視される問題を根本回避する。
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
    this._seStart   = document.getElementById('se-start');
    this._seButton  = document.getElementById('se-button');
    this._seSuccess = document.getElementById('se-success');
    this._seMiss    = document.getElementById('se-miss');

    // 状態フラグ
    this._currentBGMKey = null;  // 現在再生中の BGM キー
    this._bgmPaused     = false; // タブ非表示で一時停止中か
    this._wakeLock      = null;  // WakeLock オブジェクト
    this._bgmVolume     = 0.75;  // BGM 音量（0.0〜1.0）
    this._seVolume      = 0.8;   // SE 音量（0.0〜1.0）
    this._muted         = false; // ユーザーによるミュート状態
    this._activeSE      = {};    // SE フォールバック用インスタンス（型ごとに追跡）

    // Web Audio API（BGM・SE 共用）
    this._audioCtx    = null; // AudioContext（ジェスチャー後に生成）
    this._bgmGainNode = null; // BGM 全体の音量制御 GainNode
    this._seGainNode  = null; // SE 全体の音量制御 GainNode
    this._seBuffers   = {};   // デコード済み SE の AudioBuffer

    // BGM 管理
    this._bgmBuffers        = {};   // デコード済み BGM の AudioBuffer（key → AudioBuffer）
    this._bgmDecoding       = {};   // デコード中の Promise（key → Promise）
    this._pendingDecodeKeys = [];   // AudioContext 生成前のデコード待ちキュー
    this._bgmSource         = null; // 現在再生中の AudioBufferSourceNode
    this._playToken         = null; // async playBGM のキャンセルトークン

    this._initVisibility();
    this._initBeforeUnload();
  }

  // ─────────────────────────────── BGM ───────────────────────────────

  /** BGM 再生（同じ曲が既に再生中なら何もしない） */
  async playBGM(key) {
    if (this._muted) return;
    if (!BGM_FILES[key]) return;
    if (this._currentBGMKey === key && this._bgmSource) return;
    if (!this._audioCtx) return; // initAudioContext() 前は再生不可

    const token = Symbol();
    this._playToken     = token;
    this._currentBGMKey = key;

    // 再生中の曲を 80ms フェードアウトして停止
    await this._fadeAndStopCurrent();
    if (this._playToken !== token) return; // 別の playBGM に上書きされた

    // バッファ未デコードの場合は完了を待つ
    // HTTP キャッシュ済みなら fetch は即完了・decodeAudioData のみ待機
    if (!this._bgmBuffers[key]) {
      if (!this._bgmDecoding[key]) this._startDecodeBGM(key);
      try { await this._bgmDecoding[key]; } catch { return; }
    }
    if (this._playToken !== token) return;

    this._startBGMSource(key);
  }

  /** BGM 停止（即時） */
  stopBGM() {
    this._playToken = null;
    this._stopBGMSource();
    this._currentBGMKey = null;
    this._bgmPaused     = false;
  }

  /**
   * BGM 一時停止（タブ非表示など）
   * AudioContext ごと suspend することで再生位置を保持したまま停止する
   */
  pauseBGM() {
    if (!this._audioCtx || this._bgmPaused) return;
    this._audioCtx.suspend();
    this._bgmPaused = true;
  }

  /** BGM 再開 */
  resumeBGM() {
    if (!this._bgmPaused || !this._audioCtx) return;
    this._audioCtx.resume();
    this._bgmPaused = false;
  }

  /** オープニング曲をランダムに再生 */
  playRandomOpening() {
    const key = Math.random() < 0.5 ? 'opening1' : 'opening2';
    this.playBGM(key);
  }

  /**
   * BGM Phase2: 6曲を優先度順にデコードキューへ追加。
   * AudioContext 未生成の場合はキューに積み、initAudioContext() 後にデコード開始する。
   * モード選択画面が表示された時点で呼ぶ。
   */
  preloadRemainingBGM() {
    const PRIORITY_KEYS = ['name_input', 'introduction', 'quiz', 'clear', 'ending_happy', 'ending_normal'];
    for (const key of PRIORITY_KEYS) {
      if (this._bgmBuffers[key] || this._bgmDecoding[key] || this._pendingDecodeKeys.includes(key)) continue;
      this._pendingDecodeKeys.push(key);
    }
    // AudioContext が既に存在する場合（通常は起こらないが念のため）は即デコード開始
    if (this._audioCtx) this._processPendingDecodes();
  }

  /**
   * Web Audio API を初期化して BGM・SE のデコードを開始する。
   * iOS の制限により必ずユーザー操作のイベントハンドラ内から呼ぶこと。
   */
  initAudioContext() {
    if (this._audioCtx) return; // 二重初期化防止
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      this._bgmGainNode = this._audioCtx.createGain();
      this._bgmGainNode.gain.value = this._bgmVolume;
      this._bgmGainNode.connect(this._audioCtx.destination);

      this._seGainNode = this._audioCtx.createGain();
      this._seGainNode.gain.value = this._seVolume;
      this._seGainNode.connect(this._audioCtx.destination);

      // SE デコード開始
      this._decodeSEBuffers();

      // BGM Phase1: opening1/2 を最優先でデコード開始
      this._startDecodeBGM('opening1');
      this._startDecodeBGM('opening2');

      // BGM Phase2: preloadRemainingBGM() でキュー済みの曲をデコード開始
      this._processPendingDecodes();
    } catch (e) {
      // Web Audio API 非対応環境では何もしない（SE フォールバックで動作継続）
    }
  }

  // ─────────────────────────── BGM 内部メソッド ───────────────────────────

  /** キュー済みキーのデコードを順に開始する */
  _processPendingDecodes() {
    for (const key of this._pendingDecodeKeys) {
      this._startDecodeBGM(key);
    }
    this._pendingDecodeKeys = [];
  }

  /**
   * BGM を fetch + decodeAudioData してキャッシュする。
   * ローディング画面の fetch().blob() によって HTTP キャッシュが充填済みのため
   * fetch は通常キャッシュヒットし、decodeAudioData の CPU 時間のみ待てばよい。
   */
  _startDecodeBGM(key) {
    if (this._bgmDecoding[key] || this._bgmBuffers[key] || !this._audioCtx) return;
    const promise = fetch(BGM_FILES[key])
      .then(r => r.arrayBuffer())
      .then(buf => this._audioCtx.decodeAudioData(buf))
      .then(decoded => { this._bgmBuffers[key] = decoded; })
      .catch(() => {})
      .finally(() => { delete this._bgmDecoding[key]; });
    this._bgmDecoding[key] = promise;
  }

  /** AudioBufferSourceNode を生成して BGM 再生を開始する */
  _startBGMSource(key) {
    if (!this._bgmBuffers[key] || !this._audioCtx || !this._bgmGainNode) return;
    const source = this._audioCtx.createBufferSource();
    source.buffer = this._bgmBuffers[key];
    source.loop   = true;
    source.connect(this._bgmGainNode);
    source.start(0);
    this._bgmSource = source;
  }

  /** 現在の BGM ソースノードを即時停止する */
  _stopBGMSource() {
    if (this._bgmSource) {
      try { this._bgmSource.stop(); } catch { }
      this._bgmSource = null;
    }
  }

  /**
   * 現在の BGM を 80ms でフェードアウトして停止する。
   * 停止後に gain を bgmVolume に復元してから Promise を解決する。
   * これにより次の BGM は通常音量で即時開始できる。
   */
  _fadeAndStopCurrent() {
    return new Promise(resolve => {
      if (!this._bgmSource) { resolve(); return; }
      const source = this._bgmSource;
      this._bgmSource = null;

      if (!this._audioCtx || !this._bgmGainNode) {
        try { source.stop(); } catch { }
        resolve();
        return;
      }

      const now = this._audioCtx.currentTime;
      this._bgmGainNode.gain.cancelScheduledValues(now);
      this._bgmGainNode.gain.setValueAtTime(this._bgmGainNode.gain.value, now);
      this._bgmGainNode.gain.linearRampToValueAtTime(0, now + 0.08); // 80ms

      setTimeout(() => {
        try { source.stop(); } catch { }
        // 次の BGM のために gain を復元（ミュート中は 0 のまま）
        if (this._audioCtx && !this._muted) {
          this._bgmGainNode.gain.setValueAtTime(this._bgmVolume, this._audioCtx.currentTime);
        }
        resolve();
      }, 90);
    });
  }

  // ─────────────────────────────── SE ───────────────────────────────

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
    if (prev) prev.pause();
    const audio = new Audio(src);
    audio.volume = this._seVolume;
    this._activeSE[type] = audio;
    const p = audio.play();
    if (p) p.catch(() => {});
  }

  /**
   * SE ファイルを fetch して AudioBuffer にデコードしキャッシュする。
   * ローディング画面で既に HTTP キャッシュに入っているため fetch は高速。
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
      } catch {
        // デコード失敗時はフォールバックが使われるため無視
      }
    }));
  }

  // ─────────────────── ミュート / WakeLock / Visibility ───────────────────

  /** ミュート切り替え */
  toggleMute() {
    this._muted = !this._muted;
    if (this._bgmGainNode) {
      const now = this._audioCtx.currentTime;
      this._bgmGainNode.gain.cancelScheduledValues(now);
      this._bgmGainNode.gain.setValueAtTime(this._muted ? 0 : this._bgmVolume, now);
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
      this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
    } catch { }
  }

  /** WakeLock 解放 */
  async releaseWakeLock() {
    if (this._wakeLock) {
      await this._wakeLock.release();
      this._wakeLock = null;
    }
  }

  /** Page Visibility API: タブ非表示時に BGM を一時停止 */
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

  /** ページを閉じる・移動する時に BGM 停止 */
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
