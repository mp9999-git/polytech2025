/**
 * developer.js - 開発チーム画面
 * developer_info.txt を fetch して表示、team.mp3 をBGMとして再生
 */

class DeveloperScreen {
  constructor(app) {
    this._app     = app;
    this._el      = document.getElementById('screen-developer');
    this._textEl  = document.getElementById('dev-text');
    this._backBtn = document.getElementById('dev-back-btn');
    this._loaded  = false;

    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      this._app.goToTitle();
    });
  }

  async show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._app.sound.playBGM('team');
    // スクロール位置をトップに戻す
    const scrollArea = document.getElementById('dev-scroll-area');
    if (scrollArea) scrollArea.scrollTop = 0;

    if (!this._loaded) {
      const cached = this._app.dataCache?.['assets/data/developer_info.txt'];
      if (cached) {
        this._textEl.textContent = cached;
        this._loaded = true;
      } else {
        try {
          const res  = await fetch('assets/data/developer_info.txt');
          const text = await res.text();
          this._textEl.textContent = text;
          this._loaded = true;
        } catch (e) {
          this._textEl.textContent = '情報の読み込みに失敗しました。';
        }
      }
    }
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }
}

export default DeveloperScreen;
