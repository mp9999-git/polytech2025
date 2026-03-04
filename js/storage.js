/**
 * storage.js - LocalStorage ラッパー
 * ゲームの進行状況・プレイヤー情報を永続化する
 */

const STORAGE_KEY = 'PolytechMemorial';

const DEFAULT_STATE = {
  playerName: '',
  teacherNames: ['先生1', '先生2', '先生3', '先生4', '先生5'],
  progress: {
    Network:  { cleared: false },
    PLC:      { cleared: false },
    Database: { cleared: false },
    Java:     { cleared: false },
    Android:  { cleared: false }
  },
  intimacy: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  currentStage: 'Network',
  allCleared: false
};

/** LocalStorageから読み込み */
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

/** LocalStorageへ保存 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('storage: save failed', e);
  }
}

/** 状態をリセット */
function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

/** 深いマージ（デフォルトとsavedを合成） */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export { loadState, saveState, resetState, DEFAULT_STATE };
