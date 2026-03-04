/**
 * quiz.js - クイズ画面
 * 3択問題・親密度システム（ステージクリア時のみ確定保存）
 * タイピングアニメーション・クリアオーバーレイ対応
 * メッセージは data/messages_quiz.json から読み込む
 */

import Confetti from '../confetti.js';

// カテゴリ → キャラID
const CATEGORY_CHAR = {
  Network:  1,
  PLC:      2,
  Database: 3,
  Java:     4,
  Android:  5
};

// ステージ順
const STAGE_ORDER = ['Network', 'PLC', 'Database', 'Java', 'Android'];

class QuizScreen {
  constructor(app) {
    this._app = app;
    this._el         = document.getElementById('screen-quiz');
    this._charImg    = document.getElementById('quiz-char');
    this._intimacyLbl= document.getElementById('quiz-intimacy-value');
    this._intimacyFx = document.getElementById('intimacy-effect');
    this._qNum       = document.getElementById('quiz-q-num');
    this._qText      = document.getElementById('quiz-question-text');
    this._choiceBtns = document.querySelectorAll('.quiz-choice-btn');
    this._teacherName= document.getElementById('quiz-teacher-name');
    this._msgText    = document.getElementById('quiz-msg-text');
    this._nextBtn    = document.getElementById('btn-quiz-next');
    this._backBtn    = document.getElementById('quiz-back-btn');
    this._clearOverlay = document.getElementById('quiz-clear-overlay');
    this._confettiCanvas = document.getElementById('confetti-canvas');
    this._confetti   = new Confetti(this._confettiCanvas);

    this._category   = null;
    this._charId     = null;
    this._questions  = [];
    this._qIndex     = 0;
    this._shuffledCorrectIdx = 0;
    this._answered     = false;
    this._correctCount = 0;
    this._confettiTimer = null;

    // ステージクリアフラグ
    this._stageCleared = false;
    this._nextStageKey = null;

    // ローカル親密度（クリア時のみstate反映）
    this._localIntimacy = {};

    // タイピング管理
    this._typingTimer    = null;
    this._typingEl       = null;
    this._typingFull     = '';
    this._typingIdx      = 0;

    // メッセージキャッシュ
    this._messages = null;
    // クイズデータキャッシュ（カテゴリ別）
    this._questionsCache = {};

    // 選択肢ボタン
    this._choiceBtns.forEach(btn => {
      btn.addEventListener('click', () => this._onChoiceClick(btn));
    });

    this._nextBtn.addEventListener('click', () => {
      if (this._isTyping()) {
        this._skipTyping();
        return;
      }
      this._app.sound.playSE('button');
      if (this._stageCleared) {
        // ステージクリア後: 遷移
        this._clearOverlay.classList.add('hidden');
        this._cleanup();
        if (this._nextStageKey) this._app.goToStory(this._nextStageKey);
        else                    this._app.goToEnding();
        return;
      }
      this._onNext();
    });

    // 戻るボタン（確認ダイアログなし・親密度はロールバック）
    this._backBtn.addEventListener('click', () => {
      this._app.sound.playSE('button');
      this._cleanup();
      this._app.goToTitle();
    });
  }

  async show(category) {
    this._category = category;
    this._charId   = CATEGORY_CHAR[category] || 1;
    this._qIndex   = 0;
    this._answered     = false;
    this._correctCount = 0;
    this._stageCleared = false;
    this._nextStageKey = null;
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    this._clearOverlay.classList.add('hidden');

    // 画面表示直後に前の先生の残像をクリア
    this._charImg.src = '';
    this._charImg.style.opacity = '0';
    this._teacherName.textContent = '';
    this._msgText.textContent = '';
    this._qText.textContent = '';
    this._qNum.textContent = '';
    this._nextBtn.classList.add('hidden');
    this._choiceBtns.forEach(btn => { btn.style.visibility = 'hidden'; });

    this._app.sound.playBGM('quiz');

    // ローカル親密度をstateからコピー（クリア時のみstateに反映）
    this._localIntimacy = Object.assign({}, this._app.state.intimacy);

    // 初回のみメッセージ JSON を取得してキャッシュ
    if (!this._messages) {
      this._messages = this._app.dataCache?.['assets/data/messages_quiz.json'] || null;
      if (!this._messages) {
        try {
          const res = await fetch('assets/data/messages_quiz.json');
          this._messages = await res.json();
        } catch {
          this._messages = { prompt: {}, correct: {}, wrong: {}, clear: {} };
        }
      }
    }

    // クイズデータ読み込み（カテゴリ別キャッシュ）
    const questions = await this._loadQuestions(category);
    // シャッフルして5問選択
    this._questions = this._shuffle(questions).slice(0, 5);
    this._showQuestion(0);
  }

  hide() {
    this._cleanup();
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  _cleanup() {
    this._confetti.stop();
    if (this._confettiTimer) {
      clearTimeout(this._confettiTimer);
      this._confettiTimer = null;
    }
    this._stopTyping();
    this._clearOverlay.classList.add('hidden');
  }

  /** JSONから問題を読み込む（カテゴリ別キャッシュ） */
  async _loadQuestions(category) {
    if (this._questionsCache[category]) return this._questionsCache[category];
    const file = `assets/data/quiz_${category.toLowerCase()}.json`;
    const cached = this._app.dataCache?.[file];
    if (cached) {
      this._questionsCache[category] = cached;
      return cached;
    }
    try {
      const res  = await fetch(file);
      const data = await res.json();
      this._questionsCache[category] = data;
      return data;
    } catch (e) {
      console.warn('quiz: load failed', e);
      return [];
    }
  }

  /** Fisher-Yates シャッフル */
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** 問題を表示 */
  _showQuestion(idx) {
    // 紙吹雪タイマーをクリア（前問のタイマー衝突防止）
    if (this._confettiTimer) {
      clearTimeout(this._confettiTimer);
      this._confettiTimer = null;
    }
    this._confetti.stop();
    this._stopTyping();
    this._answered = false;
    const q       = this._questions[idx];
    const charId  = this._charId;
    const teacherNames = this._app.state.teacherNames;

    // Q番号
    this._qNum.textContent = `Q${idx + 1} / 5`;

    // 問題文
    this._qText.textContent = q.q;

    // 選択肢をシャッフル（正解を含む3択）
    const choices = this._buildChoices(q);
    this._choiceBtns.forEach((btn, i) => {
      btn.textContent = choices[i].text;
      btn.disabled    = false;
      btn.className   = 'quiz-choice-btn';
      btn.style.visibility = 'visible';
    });

    // キャラ（通常）
    this._charImg.src = `assets/images/teacher${charId}.webp`;
    this._charImg.style.opacity = '1';
    this._choiceBtns.forEach(btn => { btn.style.visibility = 'visible'; });

    // 親密度（ローカル値を表示）
    const intimacy = this._localIntimacy[charId] || 0;
    this._intimacyLbl.textContent = intimacy;

    // 先生名とプロンプトコメント（タイピングアニメ）
    const teacherName = teacherNames[charId - 1] || `先生${charId}`;
    this._teacherName.textContent = teacherName;
    const prompts = (this._messages.prompt || {})[charId] || (this._messages.prompt || {})['1'] || [];
    const promptText = prompts[Math.floor(Math.random() * prompts.length)] || '';
    this._startTyping(promptText, this._msgText);

    // 次へボタン非表示・テキストリセット
    this._nextBtn.classList.add('hidden');
    this._nextBtn.textContent = '次へ ▶';
  }

  /** 正解+不正解2択のシャッフル配列を作る */
  _buildChoices(q) {
    const correct = { text: q.a, isCorrect: true };
    const wrongs  = q.choices.map(c => ({ text: c, isCorrect: false }));
    const all     = [correct, ...wrongs];
    const shuffled = this._shuffle(all);
    this._shuffledCorrectIdx = shuffled.findIndex(c => c.isCorrect);
    return shuffled;
  }

  /** 選択肢クリック */
  _onChoiceClick(btn) {
    if (this._answered) return;
    this._answered = true;
    this._stopTyping();

    const chosenIdx = parseInt(btn.dataset.idx, 10);
    const isCorrect = (chosenIdx === this._shuffledCorrectIdx);

    // ボタン全部無効化
    this._choiceBtns.forEach((b, i) => {
      b.disabled = true;
      if (i === this._shuffledCorrectIdx) {
        b.classList.add('correct');
      } else if (b === btn && !isCorrect) {
        b.classList.add('wrong');
      }
    });

    const charId = this._charId;

    if (isCorrect) {
      this._app.sound.playSE('success');
      this._correctCount++;
      // ローカル親密度 +1（stateには反映しない）
      this._localIntimacy[charId] = (this._localIntimacy[charId] || 0) + 1;
      this._updateIntimacyDisplay(this._localIntimacy[charId]);
      this._showIntimacyEffect('+1', 'positive');
      // キャラ笑顔
      this._charImg.src = `assets/images/teacher${charId}_happy.webp`;
      // 紙吹雪
      this._confetti.start();
      this._confettiTimer = setTimeout(() => {
        this._confetti.stop();
        this._confettiTimer = null;
      }, 4000);
      // コメント（タイピング）＋解説を1テキストで表示
      const comments = (this._messages.correct || {})[charId] || (this._messages.correct || {})['1'] || [];
      const comment = comments[Math.floor(Math.random() * comments.length)] || '';
      this._setCommentWithExp(comment, this._questions[this._qIndex]);
    } else {
      this._app.sound.playSE('miss');
      // ローカル親密度 -1（最小0）
      this._localIntimacy[charId] = Math.max(0, (this._localIntimacy[charId] || 0) - 1);
      this._updateIntimacyDisplay(this._localIntimacy[charId]);
      this._showIntimacyEffect('-1', 'negative');
      // キャラ泣き顔
      this._charImg.src = `assets/images/teacher${charId}_cry.webp`;
      // コメント（タイピング）＋解説を1テキストで表示
      const comments = (this._messages.wrong || {})[charId] || (this._messages.wrong || {})['1'] || [];
      const comment = comments[Math.floor(Math.random() * comments.length)] || '';
      this._setCommentWithExp(comment, this._questions[this._qIndex]);
    }

    // 先生名を更新
    const name = this._app.state.teacherNames[charId - 1] || `先生${charId}`;
    this._teacherName.textContent = name;

    this._nextBtn.classList.remove('hidden');
  }

  /** コメントと解説を1テキストにまとめてタイピング（重複防止） */
  _setCommentWithExp(comment, q) {
    const fullText = (q && q.exp)
      ? comment + '\n【解説】' + q.exp
      : comment;
    this._startTyping(fullText, this._msgText);
  }

  _updateIntimacyDisplay(value) {
    this._intimacyLbl.textContent = value;
    this._intimacyLbl.style.transform = 'scale(1.5)';
    setTimeout(() => {
      this._intimacyLbl.style.transform = 'scale(1)';
      this._intimacyLbl.style.transition = 'transform 0.15s ease';
    }, 150);
  }

  _showIntimacyEffect(text, type) {
    const el = this._intimacyFx;
    el.textContent = text;
    el.className   = `${type}`;
    el.style.display = 'block';
    el.style.left = '140px';
    el.style.top  = '200px';
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = 'intimacy-float 1.2s ease-out forwards';
    setTimeout(() => { el.style.display = 'none'; }, 1200);
  }

  /** 次へボタン（通常問題進行用） */
  _onNext() {
    // 紙吹雪タイマークリア
    if (this._confettiTimer) {
      clearTimeout(this._confettiTimer);
      this._confettiTimer = null;
    }
    this._confetti.stop();
    this._stopTyping();
    this._qIndex++;
    if (this._qIndex < this._questions.length) {
      this._showQuestion(this._qIndex);
    } else {
      // ステージクリア処理
      Object.assign(this._app.state.intimacy, this._localIntimacy);
      this._app.state.progress[this._category].cleared = true;
      const nextStage = this._getNextStage();
      if (!nextStage) this._app.state.allCleared = true;
      this._app.saveState();

      this._stageCleared = true;
      this._nextStageKey = nextStage;

      // クリアオーバーレイ表示（透明・クリック透過）
      this._clearOverlay.classList.remove('hidden');
      this._app.sound.playBGM('clear');

      // 先生をhappy表情に
      this._charImg.src = `assets/images/teacher${this._charId}_happy.webp`;

      // 先生名を表示
      const teacherName = this._app.state.teacherNames[this._charId - 1] || `先生${this._charId}`;
      this._teacherName.textContent = teacherName;

      // ステージクリア総評メッセージをタイピング（先頭に正解数を表示）
      const clears = (this._messages.clear || {})[this._charId] || (this._messages.clear || {})['1'] || [];
      const clearMsg = clears[Math.floor(Math.random() * clears.length)] || '';
      const scoreText = `【結果】${this._questions.length}問中${this._correctCount}問正解！`;
      this._startTyping(scoreText + '\n' + clearMsg, this._msgText);

      // 次へボタン（遷移用テキスト）
      this._nextBtn.textContent = nextStage ? '次のステージへ ▶' : 'エンディングへ ▶';
      this._nextBtn.classList.remove('hidden');
    }
  }

  _getNextStage() {
    const idx = STAGE_ORDER.indexOf(this._category);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
  }

  // ---- タイピングアニメーション ----

  _startTyping(text, el) {
    this._stopTyping();
    this._typingEl   = el;
    this._typingFull = text;
    this._typingIdx  = 0;
    el.textContent   = '';
    this._typeChar();
  }

  _typeChar() {
    if (!this._typingEl) return;
    if (this._typingIdx < this._typingFull.length) {
      this._typingEl.textContent = this._typingFull.slice(0, this._typingIdx + 1);
      this._typingIdx++;
      this._typingTimer = setTimeout(() => this._typeChar(), 28);
    } else {
      this._typingTimer = null;
      this._typingEl    = null;
    }
  }

  _isTyping() {
    return this._typingTimer !== null;
  }

  _skipTyping() {
    this._stopTyping();
    if (this._typingEl && this._typingFull) {
      this._typingEl.textContent = this._typingFull;
    }
    this._typingEl = null;
  }

  _stopTyping() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      this._typingTimer = null;
    }
    this._typingEl = null;
  }
}

export default QuizScreen;
