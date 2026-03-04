/**
 * storage.js - LocalStorage ラッパー
 * ゲームの進行状況・プレイヤー情報を永続化する
 *
 * 【保存キー】
 *   'PolytechMemorial' という名前で JSON 文字列として保存される
 *
 * 【バージョンアップ対応】
 *   deepMerge によりデフォルト値と保存データを合成するため、
 *   新しいキーをデフォルト値に追加するだけで古いセーブデータに自動対応できる
 */

// LocalStorage に使うキー名（ブラウザ上で一意な識別子）
const STORAGE_KEY = 'PolytechMemorial';

/**
 * ゲームの初期状態（デフォルト値）
 * セーブデータがない場合や新しいキーが増えた場合の補完に使用する
 */
const DEFAULT_STATE = {
  playerName: '',                                          // 訓練生の名前
  teacherNames: ['先生1', '先生2', '先生3', '先生4', '先生5'], // 各先生の名前
  progress: {
    Network:  { cleared: false },
    PLC:      { cleared: false },
    Database: { cleared: false },
    Java:     { cleared: false },
    Android:  { cleared: false }
  },
  intimacy: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, // 各先生との親密度（0〜5）
  currentStage: 'Network',                       // 現在のステージ（将来の拡張用）
  allCleared: false,                             // 全ステージクリアフラグ
  gameMode: 1  // 1: 乙女ゲームモード, 2: SDゲームモード
};

/**
 * LocalStorage からゲーム状態を読み込む
 * セーブデータが存在すれば deepMerge でデフォルト値と合成して返す
 * 読み込み失敗時（JSON 破損など）はデフォルト値を返す
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const saved = JSON.parse(raw);
    // デフォルト値とマージ（新しいキーに対応）
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), saved);
  } catch (e) {
    console.warn('storage: load failed', e);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

/**
 * ゲーム状態を LocalStorage へ保存する
 * 保存失敗時（容量オーバーなど）はコンソール警告のみで続行する
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('storage: save failed', e);
  }
}

/**
 * ゲーム状態をリセットする
 * LocalStorage のデータを削除し、デフォルト値を返す
 * ※ gameMode は呼び出し側（app.js の newGame）で別途保持・復元すること
 */
function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

/**
 * オブジェクトを深くマージする（target に source の値を上書き）
 *
 * 動作の詳細：
 *  - source のキーを順番に処理する
 *  - 値がオブジェクト（かつ配列でない）の場合 → 再帰的にマージ
 *  - 値が配列またはプリミティブ（文字列・数値など）の場合 → そのまま上書き
 *
 * 例：teacherNames は配列なので保存データの配列がそのまま使われる
 *     progress は入れ子オブジェクトなので再帰的にマージされる
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' &&
      !Array.isArray(source[key])  // 配列はそのまま代入（ネストしてマージしない）
    ) {
      // オブジェクトは再帰的にマージ（target 側のキーがなければ空オブジェクトで初期化）
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      // 配列・プリミティブ値はそのまま上書き
      target[key] = source[key];
    }
  }
  return target;
}

export { loadState, saveState, resetState, DEFAULT_STATE };
