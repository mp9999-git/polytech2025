/**
 * ending.js - エンディング画面
 * 全ステージクリア後、親密度に基づいてGOOD END / NORMAL ENDを判定
 * メッセージは data/messages_ending.json から読み込む
 */

import Confetti from '../confetti.js';

const TYPING_INTERVAL = 28;

class EndingScreen {
  constructor(app) {
    this._app = app;
    this._el            = document.getElementById('screen-ending');
    this._bgImg         = document.getElementById('ending-bg');
    this._charsContainer= document.getElementById('ending-chars-container');
    this._typeText      = document.getElementById('ending-type-text');
    this._msgText       = document.getElementById('ending-msg-text');
    this._titleBtn      = document.getElementById('btn-ending-title');
    this._confettiCanvas= document.getElementById('ending-confetti-canvas');
    this._confetti      = new Confetti(this._confettiCanvas);

    this._typingTimer   = null;
    this._typingFull    = '';
    this._typingPos     = 0;
    this._typingEl      = null;

    this._messages      = null;

    this._titleBtn.addEventListener('click', () => {
      if (this._isTyping()) {
        this._skipTyping();
        return;
      }
      this._app.sound.playSE('button');
      this._confetti.stop();
      this._stopTyping();
      this._app.goToTitle();
    });
  }

  async show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');

    // 初回のみ JSON を fetch してキャッシュ
    if (!this._messages) {
      try {
        const res = await fetch('assets/data/messages_ending.json');
        this._messages = await res.json();
      } catch {
        this._messages = { good: {}, normal: [] };
      }
    }

    const GOOD_END_THRESHOLD = 3;
    const intimacy     = this._app.state.intimacy;
    const teacherNames = this._app.state.teacherNames;

    // 最高親密度のキャラを探す
    let maxIntimacy = -1;
    for (let id = 1; id <= 5; id++) {
      if ((intimacy[id] || 0) > maxIntimacy) maxIntimacy = intimacy[id] || 0;
    }

    const topCharIds = [];
    for (let id = 1; id <= 5; id++) {
      if ((intimacy[id] || 0) === maxIntimacy) topCharIds.push(id);
    }

    const isGoodEnd = maxIntimacy >= GOOD_END_THRESHOLD;

    if (isGoodEnd) {
      this._showGoodEnd(topCharIds, teacherNames);
    } else {
      this._showNormalEnd(topCharIds, teacherNames);
    }
  }

  hide() {
    this._confetti.stop();
    this._stopTyping();
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  _showGoodEnd(topCharIds, teacherNames) {
    this._bgImg.src = 'assets/images/ending_good.webp';
    this._app.sound.playBGM('ending_happy');

    this._typeText.textContent = '✨ GOOD END ✨';
    this._typeText.style.color = '#FF0000';

    // キャラクター表示（全員笑顔）
    this._renderChars(topCharIds, teacherNames, this._app.state.intimacy, true);

    // 複数先生が同列の場合は全員のメッセージをランダム選択して \n で連結
    const playerName = this._app.state.playerName || '訓練生';
    const messages = topCharIds.map(id => {
      const teacherName = teacherNames[id - 1] || `先生${id}`;
      const patterns = (this._messages.good || {})[id] || (this._messages.good || {})['1'] || [];
      const tpl = patterns[Math.floor(Math.random() * patterns.length)] || '';
      return this._applyTemplate(tpl, { teacher: teacherName, player: playerName });
    });
    const principalPatterns = (this._messages.good || {}).principal || [];
    const principalMsg = principalPatterns[Math.floor(Math.random() * principalPatterns.length)] || '';
    const fullMsg = principalMsg ? messages.join('\n') + '\n' + principalMsg : messages.join('\n');
    this._startTyping(fullMsg, this._msgText);

    // 紙吹雪
    setTimeout(() => this._confetti.start(), 500);
    this._confettiCanvas.style.display = 'block';
  }

  _showNormalEnd(topCharIds, teacherNames) {
    this._bgImg.src = 'assets/images/ending_normal.webp';
    this._app.sound.playBGM('ending_normal');

    this._typeText.textContent = 'NORMAL END';
    this._typeText.style.color = '#FF0000';

    // キャラクター表示（通常）
    this._renderChars(topCharIds, teacherNames, this._app.state.intimacy, false);

    // normalはランダム選択
    const topName = teacherNames[topCharIds[0] - 1] || `先生${topCharIds[0]}`;
    const normalPatterns = this._messages.normal || [];
    const tpl = normalPatterns[Math.floor(Math.random() * normalPatterns.length)] || '';
    const msg = this._applyTemplate(tpl, { teacher: topName });
    this._startTyping(msg, this._msgText);
  }

  _renderChars(charIds, teacherNames, intimacy, isHappy) {
    this._charsContainer.innerHTML = '';
    const suffix = isHappy ? '_happy' : '';
    charIds.forEach(id => {
      const name = teacherNames[id - 1] || `先生${id}`;
      const item = document.createElement('div');
      item.className = 'ending-char-item';

      const img = document.createElement('img');
      img.src       = `assets/images/teacher${id}${suffix}.webp`;
      img.className = 'ending-char-img';
      img.alt       = name;

      const nameLbl = document.createElement('div');
      nameLbl.className = 'ending-char-name';
      nameLbl.textContent = `★ ${name}（親密度: ${intimacy[id] || 0}）`;

      item.appendChild(img);
      item.appendChild(nameLbl);
      this._charsContainer.appendChild(item);
    });
  }

  /** プレースホルダー置換 */
  _applyTemplate(str, vars) {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  // ---- タイピングアニメーション ----

  _startTyping(text, el) {
    this._stopTyping();
    this._typingFull = text;
    this._typingPos  = 0;
    this._typingEl   = el;
    el.textContent   = '';
    this._typeChar();
  }

  _typeChar() {
    if (this._typingPos >= this._typingFull.length) {
      this._typingTimer = null;
      this._typingEl    = null;
      return;
    }
    this._typingEl.textContent += this._typingFull[this._typingPos];
    this._typingPos++;
    this._typingTimer = setTimeout(() => this._typeChar(), TYPING_INTERVAL);
  }

  _isTyping() {
    return this._typingTimer !== null;
  }

  _skipTyping() {
    if (!this._isTyping()) return;
    clearTimeout(this._typingTimer);
    this._typingTimer = null;
    if (this._typingEl) {
      this._typingEl.textContent = this._typingFull;
      this._typingEl = null;
    }
  }

  _stopTyping() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      this._typingTimer = null;
    }
    this._typingEl = null;
  }
}

export default EndingScreen;
