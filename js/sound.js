/**
 * sound.js - SoundManager
 * BGM・SE の再生管理、WakeLock、Page Visibility 対応
 *
 * 【主な機能】
 *  - BGM: playBGM() 呼び出し時に初めて new Audio() を生成（遅延初期化）。
 *         一度生成した Audio オブジェクトはキャッシュして再利用する。
 *         切り替え時は短いフェードアウト（80ms）を挟んでデジタルクリックを防止する。
 *  - SE: Web Audio API（AudioBufferSourceNode）で低遅延再生
 *       AudioContext 未対応時は new Audio() でフォールバック
 *  - WakeLock API: 画面スリープを防止（スマートフォン向け）
 *  - Page Visibility API: タブを非表示にした時に BGM を自動一時停止・復帰
 *
 * 【_bgmPaused と _muted の違い】
 *  - _bgmPaused: タブ非表示など「システム都合」で一時停止した状態（再表示時に自動再開）
 *  - _muted: ユーザーが明示的にミュートした状態（自動解除しない）
 *
 * 【iOS Safari のオーディオ制限について】
 *  iOS はユーザー操作（タップ等）なしに音声を再生できない。
 *  initAudioContext() をモード選択ボタンのハンドラ内で呼ぶことで AudioContext を解除する。
 *  opening BGM は initAudioContext() 内で事前生成・load() し、HTTP キャッシュから高速バッファリング。
 *  他 BGM は playBGM() 呼び出し時に遅延生成する（loading.js の fetch() で HTTP キャッシュ済み）。
 *  全 BGM の一括 play()→pause() はノイズの原因になるため廃止した。
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

    // BGM は playBGM() 呼び出し時に遅延生成してキャッシュする。
    // 起動時の全曲プリロードは行わない（iOS 負荷軽減のため）。
    this._bgmPlayers = {};

    this._initVisibility();
    this._initBeforeUnload();
  }

  /** BGM 再生（同じ曲が既に再生中なら何もしない） */
  playBGM(key) {
    if (this._muted) return;
    if (!BGM_FILES[key]) return;
    if (this._currentBGMKey === key && this._bgmPlayers[key] && !this._bgmPlayers[key].paused) return;

    // 再生中の別曲をフェードアウトして停止（デジタルクリック防止）
    if (this._currentBGMKey && this._currentBGMKey !== key && this._bgmPlayers[this._currentBGMKey]) {
      this._fadeAndStop(this._bgmPlayers[this._currentBGMKey]);
    }

    this._currentBGMKey = key;

    // 未生成なら new Audio() で遅延生成してキャッシュ
    if (!this._bgmPlayers[key]) {
      const audio = new Audio(BGM_FILES[key]);
      audio.loop    = true;
      audio.volume  = this._bgmVolume;
      audio.preload = 'auto'; // HTTP キャッシュからの読み込みを即開始
      this._bgmPlayers[key] = audio;
    }

    const player = this._bgmPlayers[key];

    // 再生対象 player に進行中のフェードがあればキャンセルして音量を復元
    if (player._fadeTimer) {
      clearInterval(player._fadeTimer);
      player._fadeTimer = null;
    }

    player.volume = this._bgmVolume;
    player.loop   = true;
    const p = player.play();
    if (p) p.catch(() => {});
  }

  /** BGM 停止（即時） */
  stopBGM() {
    if (this._currentBGMKey) {
      const player = this._bgmPlayers[this._currentBGMKey];
      if (player) { player.pause(); player.currentTime = 0; }
    }
    this._currentBGMKey = null;
    this._bgmPaused     = false;
  }

  /** BGM 一時停止（即時・タブ非表示など） */
  pauseBGM() {
    if (!this._currentBGMKey) return;
    const player = this._bgmPlayers[this._currentBGMKey];
    if (player && !player.paused) {
      player.pause();
      this._bgmPaused = true;
    }
  }

  /** BGM 再開 */
  resumeBGM() {
    if (this._bgmPaused && this._currentBGMKey) {
      const player = this._bgmPlayers[this._currentBGMKey];
      if (player) {
        const p = player.play();
        if (p) p.catch(() => {});
      }
      this._bgmPaused = false;
    }
  }

  /** オープニング曲をランダムに再生 */
  playRandomOpening() {
    const key = Math.random() < 0.5 ? 'opening1' : 'opening2';
    this.playBGM(key);
  }

  /**
   * BGM をフェードアウトしてから停止する（デジタルクリック防止用）。
   * BGM 切り替え時のみ使用。ページ離脱や一時停止は即時停止でよい。
   * @param {HTMLAudioElement} player
   */
  _fadeAndStop(player) {
    // 同じ player に対して既存のフェードが動いていればキャンセル
    if (player._fadeTimer) {
      clearInterval(player._fadeTimer);
      player._fadeTimer = null;
    }
    if (player.paused) { player.currentTime = 0; return; }
    const startVol = player.volume;
    const STEPS    = 8;
    const INTERVAL = 10; // ms（合計80ms）
    let step = 0;
    player._fadeTimer = setInterval(() => {
      step++;
      player.volume = startVol * (1 - step / STEPS);
      if (step >= STEPS) {
        clearInterval(player._fadeTimer);
        player._fadeTimer = null;
        player.pause();
        player.currentTime = 0;
        player.volume = this._muted ? 0 : this._bgmVolume;
      }
    }, INTERVAL);
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
   * iOS の制限により必ずユーザー操作のイベントハンドラ内から呼ぶこと。
   *
   * タイトル画面で再生する opening BGM（2曲）をここで事前生成し load() を呼ぶ。
   * iOS Safari はユーザージェスチャー内で load() を呼ぶことでバッファリングを開始できる。
   * loading 画面の fetch() で HTTP キャッシュ済みのため、バッファリングは高速に完了する。
   * このメソッド直後に playBGM() が呼ばれるため、Audio 要素はすでに存在して即再生できる。
   *
   * ※ 全 BGM の一括 play()→pause()（旧バルクアンロック）は廃止。
   *    iOS オーディオエンジンに過負荷をかけてノイズを引き起こすため。
   */
  initAudioContext() {
    if (this._audioCtx) return; // 二重初期化防止
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._seGainNode = this._audioCtx.createGain();
      this._seGainNode.gain.value = this._seVolume;
      this._seGainNode.connect(this._audioCtx.destination);
      this._decodeSEBuffers();
    } catch (e) {
      // Web Audio API 非対応環境では何もしない（new Audio() フォールバックで動作継続）
    }

    // ユーザージェスチャー内で opening BGM を事前生成・バッファリング開始（iOS 対応）
    for (const key of ['opening1', 'opening2']) {
      if (!this._bgmPlayers[key]) {
        const audio = new Audio(BGM_FILES[key]);
        audio.loop    = true;
        audio.volume  = this._bgmVolume;
        audio.preload = 'auto';
        audio.load(); // iOS: ジェスチャー内で呼ぶことでバッファリングを許可・開始
        this._bgmPlayers[key] = audio;
      }
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
