/**
 * quizEditor.js - 問題閲覧モード画面
 * 各カテゴリのクイズ問題を読み取り専用で一覧表示する
 */

const CATEGORIES = ['Network', 'PLC', 'Database', 'Java', 'Android'];

class QuizEditorScreen {
  constructor(app) {
    this._app     = app;
    this._el      = document.getElementById('screen-quiz-editor');
    this._tabs    = document.querySelectorAll('.qe-tab-btn');
    this._list    = document.getElementById('qe-question-list');
    this._loading = document.getElementById('qe-loading');
    this._backBtn = document.getElementById('qe-back-btn');

    this._currentCat = CATEGORIES[0];
    this._cache      = {};

    this._tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        this._app.sound.playSE('button');
        this._selectTab(btn.dataset.cat);
      });
    });

    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      this.hide();
      this._app.goToTitle();
    });
  }

  show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._app.sound.playBGM('edit');
    this._selectTab(CATEGORIES[0]);
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  async _selectTab(cat) {
    this._currentCat = cat;

    // タブのアクティブ切り替え
    this._tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });

    // ローディング表示・スクロールリセット
    this._list.innerHTML = '';
    this._list.scrollTop = 0;
    if (this._loading) this._loading.style.display = 'block';

    const questions = await this._loadQuestions(cat);

    if (this._loading) this._loading.style.display = 'none';

    if (questions.length === 0) {
      this._list.innerHTML = '<p class="qe-empty">問題データがありません。</p>';
      return;
    }

    questions.forEach((q, idx) => {
      const item = document.createElement('div');
      item.className = 'qe-question-item';

      item.innerHTML = `
        <div class="qe-q-num">Q${idx + 1}</div>
        <div class="qe-q-text">${this._esc(q.q)}</div>
        <div class="qe-q-answer">✅ 正解：${this._esc(q.a)}</div>
        ${(q.choices || []).map((w, i) => `<div class="qe-q-wrong">❌ 不正解${i + 1}：${this._esc(w)}</div>`).join('')}
        ${q.exp ? `<div class="qe-q-exp">💡 解説：${this._esc(q.exp)}</div>` : ''}
      `;
      this._list.appendChild(item);
    });
  }

  async _loadQuestions(cat) {
    if (this._cache[cat]) return this._cache[cat];
    try {
      const res  = await fetch(`assets/data/quiz_${cat.toLowerCase()}.json`);
      const data = await res.json();
      this._cache[cat] = Array.isArray(data) ? data : [];
    } catch {
      this._cache[cat] = [];
    }
    return this._cache[cat];
  }

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export default QuizEditorScreen;
