/**
 * musicTest.js - 音楽テスト画面
 * BGM・SEの一覧を表示し、再生・停止を行う
 *
 * 【再生状態の管理】
 *  _activeBgmKey: 現在再生中の BGM キー（null なら何も再生していない）
 *  BGM を切り替えるときは一度 stopBGM() してから新しいものを再生する
 *
 * 【再生中のハイライト】
 *  再生中の行には .mt-playing クラスを付与して視覚的に区別する
 *  停止したり別の曲に切り替えると自動的に解除される
 */

import { BGM_FILES } from '../sound.js';

const BGM_LABELS = {
  opening1:      'オープニング1',
  opening2:      'オープニング2',
  name_input:    '名前入力',
  introduction:  'イントロダクション',
  quiz:          'クイズ',
  edit:          '問題閲覧',
  clear:         'ステージクリア',
  ending_happy:  'エンディング（GOOD END）',
  ending_normal: 'エンディング（NORMAL END）',
  team:          '開発チーム'
};

const SE_LIST = [
  { key: 'start',   label: 'スタート音' },
  { key: 'button',  label: 'ボタン音' },
  { key: 'success', label: '正解音' },
  { key: 'miss',    label: '不正解音' }
];

class MusicTestScreen {
  constructor(app) {
    this._app     = app;
    this._el      = document.getElementById('screen-music-test');
    this._bgmList = document.getElementById('mt-bgm-list');
    this._seList  = document.getElementById('mt-se-list');
    this._backBtn = document.getElementById('mt-back-btn');

    this._activeBgmKey = null;

    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      this._app.sound.stopBGM();
      this._activeBgmKey = null;
      this.hide();
      this._app.goToTitle();
    });
  }

  show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._app.sound.stopBGM();
    this._activeBgmKey = null;
    this._renderBgm();
    this._renderSe();
    // スクロール位置をトップに戻す
    const content = document.getElementById('mt-content');
    if (content) content.scrollTop = 0;
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  _renderBgm() {
    this._bgmList.innerHTML = '';
    Object.keys(BGM_LABELS).forEach(key => {
      const row = document.createElement('div');
      row.className = 'mt-track-row';
      row.dataset.key = key;

      const label = document.createElement('span');
      label.className   = 'mt-track-name';
      label.textContent = BGM_LABELS[key];

      const btnGroup = document.createElement('div');
      btnGroup.className = 'mt-btn-group';

      const playBtn = document.createElement('button');
      playBtn.className   = 'mt-play-btn';
      playBtn.textContent = '▶ 再生';
      playBtn.addEventListener('click', () => this._playBgm(key));

      const stopBtn = document.createElement('button');
      stopBtn.className   = 'mt-stop-btn';
      stopBtn.textContent = '■ 停止';
      stopBtn.addEventListener('click', () => this._stopBgm());

      btnGroup.appendChild(playBtn);
      btnGroup.appendChild(stopBtn);
      row.appendChild(label);
      row.appendChild(btnGroup);
      this._bgmList.appendChild(row);
    });
  }

  _renderSe() {
    this._seList.innerHTML = '';
    SE_LIST.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'mt-track-row';

      const lbl = document.createElement('span');
      lbl.className   = 'mt-track-name';
      lbl.textContent = label;

      const btnGroup = document.createElement('div');
      btnGroup.className = 'mt-btn-group';

      const playBtn = document.createElement('button');
      playBtn.className   = 'mt-play-btn';
      playBtn.textContent = '▶ 再生';
      playBtn.addEventListener('click', () => {
        this._app.sound.playSE(key);
      });

      btnGroup.appendChild(playBtn);
      row.appendChild(lbl);
      row.appendChild(btnGroup);
      this._seList.appendChild(row);
    });
  }

  _playBgm(key) {
    this._activeBgmKey = key;
    this._app.sound.stopBGM();
    this._app.sound.playBGM(key);
    this._updateBgmHighlight(key);
  }

  _stopBgm() {
    this._app.sound.stopBGM();
    this._activeBgmKey = null;
    this._updateBgmHighlight(null);
  }

  _updateBgmHighlight(activeKey) {
    this._bgmList.querySelectorAll('.mt-track-row').forEach(row => {
      row.classList.toggle('mt-playing', row.dataset.key === activeKey);
    });
  }
}

export default MusicTestScreen;
