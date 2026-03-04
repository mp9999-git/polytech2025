/**
 * story.js - ストーリー（先生との会話）画面
 * キャラクターごとの導入会話をタイピングアニメーションで表示する
 * 会話スクリプトは data/messages_story.json から読み込む
 */

// カテゴリ → キャラID のマッピング
const CATEGORY_CHAR = {
  Network:  1,
  PLC:      2,
  Database: 3,
  Java:     4,
  Android:  5
};

class StoryScreen {
  constructor(app) {
    this._app = app;
    this._el          = document.getElementById('screen-story');
    this._charImg     = document.getElementById('story-char');
    this._teacherName = document.getElementById('story-teacher-name');
    this._msgText     = document.getElementById('story-msg-text');
    this._nextBtn     = document.getElementById('btn-story-next');
    this._backBtn     = document.getElementById('story-back-btn');

    this._category    = null;
    this._charId      = null;
    this._script      = [];
    this._scriptIndex = 0;
    this._typingTimer = null;

    // スクリプトキャッシュ
    this._scripts = null;

    this._nextBtn.addEventListener('click', () => {
      if (this._isTyping()) {
        this._skipTyping();
      } else {
        this._app.sound.playSE('button');
        this._advance();
      }
    });

    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      if (this._typingTimer) clearTimeout(this._typingTimer);
      this._app.goToTitle();
    });
  }

  async show(category) {
    this._category    = category;
    this._charId      = CATEGORY_CHAR[category] || 1;
    this._scriptIndex = 0;
    this._el.classList.remove('hidden');
    this._el.classList.add('active');

    // BGM
    this._app.sound.playBGM('introduction');

    // 初回のみ JSON を fetch してキャッシュ
    if (!this._scripts) {
      try {
        const res = await fetch('assets/data/messages_story.json');
        this._scripts = await res.json();
      } catch {
        this._scripts = {};
      }
    }

    // ランダムでパターン選択
    const patterns = this._scripts[category] || this._scripts['Android'] || [];
    this._script = patterns[Math.floor(Math.random() * patterns.length)] || [];

    this._showLine(0);
  }

  hide() {
    if (this._typingTimer) clearTimeout(this._typingTimer);
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  /** 指定インデックスのセリフを表示 */
  _showLine(idx) {
    const [speaker, text] = this._script[idx];
    const teacherNames = this._app.state.teacherNames;
    const playerName   = this._app.state.playerName || '訓練生';

    // スピーカー名を解決
    const resolvedSpeaker = this._resolveName(speaker, teacherNames, playerName);
    this._teacherName.textContent = resolvedSpeaker;

    // テキストを解決
    const resolvedText = this._resolveName(text, teacherNames, playerName);

    // プレイヤー発言の場合はキャラ非表示
    if (speaker === '{player}') {
      this._charImg.style.visibility = 'hidden';
    } else {
      this._charImg.src = `assets/images/teacher${this._charId}.webp`;
      this._charImg.style.visibility = 'visible';
    }

    // タイピングアニメーション
    this._startTyping(resolvedText);
  }

  /** プレースホルダーを実際の名前に変換 */
  _resolveName(str, teacherNames, playerName) {
    let result = str;
    for (let i = 1; i <= 5; i++) {
      result = result.replaceAll(`{teacher${i}}`, teacherNames[i - 1] || `先生${i}`);
    }
    result = result.replaceAll('{player}', playerName);
    return result;
  }

  /** タイピングアニメーション */
  _startTyping(text) {
    this._msgText.textContent = '';
    this._msgText.dataset.fullText = text;
    this._msgText.dataset.typed    = '0';
    this._typeChar();
  }

  _typeChar() {
    const el   = this._msgText;
    const full = el.dataset.fullText;
    const idx  = parseInt(el.dataset.typed, 10);
    if (idx < full.length) {
      el.textContent = full.slice(0, idx + 1);
      el.dataset.typed = idx + 1;
      this._typingTimer = setTimeout(() => this._typeChar(), 30);
    } else {
      this._typingTimer = null;
    }
  }

  _isTyping() {
    return this._typingTimer !== null;
  }

  _skipTyping() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      this._typingTimer = null;
    }
    const el = this._msgText;
    el.textContent = el.dataset.fullText;
  }

  /** 次のセリフへ進む or クイズへ */
  _advance() {
    this._scriptIndex++;
    if (this._scriptIndex < this._script.length) {
      this._showLine(this._scriptIndex);
    } else {
      // クイズへ遷移
      this._app.goToQuiz(this._category);
    }
  }
}

export default StoryScreen;
