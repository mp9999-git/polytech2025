/**
 * quiz.js - クイズ画面
 * 3択問題・親密度システム（ステージクリア時のみ確定保存）
 * タイピングアニメーション・クリアオーバーレイ対応
 * メッセージは data/messages_quiz.json から読み込む
 *
 * 【親密度の仕組み】
 *  - クイズ中は _localIntimacy というローカルコピーで増減を管理する
 *  - 正解: +1（上限なし）/ 不正解: -1（最小0）
 *  - ステージクリア時のみ app.state.intimacy に反映・保存する
 *  - 途中で「タイトルへ戻る」とロールバックされ、state は変わらない
 *
 * 【クリア時の先生表情】
 *  親密度 0   → _cry（Mode1） または _cry2（Mode2）
 *  親密度 1   → _cry
 *  親密度 2-3 → 通常（接尾辞なし）
 *  親密度 4+  → _happy
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
    // クリアメッセージキャッシュ（得点別）
    this._clearMessages = null;
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

    // 背景画像をモードに応じて設定
    document.getElementById('quiz-bg').src = this._app.getImgPath('haikei.webp');

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

    // 得点別クリアメッセージ JSON を取得してキャッシュ
    if (!this._clearMessages) {
      this._clearMessages = this._app.dataCache?.['assets/data/messages_quiz_clear.json'] || null;
      if (!this._clearMessages) {
        try {
          const res = await fetch('assets/data/messages_quiz_clear.json');
          this._clearMessages = await res.json();
        } catch {
          this._clearMessages = {};
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
    this._clearOverlay.querySelectorAll('.end-star').forEach(e => e.remove());
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
    this._charImg.src = this._app.getImgPath(`teacher${charId}.webp`);
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
      this._charImg.src = this._app.getImgPath(`teacher${charId}_happy.webp`);
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
      this._charImg.src = this._app.getImgPath(`teacher${charId}_cry.webp`);
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

  /** 親密度表示を更新し、一瞬拡大するアニメーションを付ける */
  _updateIntimacyDisplay(value) {
    this._intimacyLbl.textContent = value;
    // scale(1.5) → 150ms後に scale(1) に戻すことでバウンスエフェクトを演出
    this._intimacyLbl.style.transform = 'scale(1.5)';
    setTimeout(() => {
      this._intimacyLbl.style.transform = 'scale(1)';
      this._intimacyLbl.style.transition = 'transform 0.15s ease';
    }, 150);
  }

  /**
   * 「+1」や「-1」を画面上でふわっと浮かび上がらせるエフェクト
   * @param {string} text - 表示するテキスト（'+1' または '-1'）
   * @param {string} type - 'positive'（金色）または 'negative'（青色）
   */
  _showIntimacyEffect(text, type) {
    const el = this._intimacyFx;
    el.textContent = text;
    // className を直接セットすることで CSS の .positive / .negative スタイルを適用
    el.className   = `${type}`;
    el.style.display = 'block';
    el.style.left = '140px';
    el.style.top  = '200px';
    // animation を一度リセットしてから再設定することで、連続クリック時にも毎回アニメが動く
    // void el.offsetWidth は DOM の再描画（reflow）を強制するおまじない
    el.style.animation = 'none';
    void el.offsetWidth; // reflow（これがないと animation のリセットが効かない場合がある）
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
      this._createClearParticles();
      this._app.sound.playBGM('clear');

      // 先生の表情を親密度に応じて選択（0:cry2/cry 1:cry 2-3:normal 4-5:happy）
      const clearIntimacy = this._localIntimacy[this._charId] || 0;
      let clearFile;
      if (clearIntimacy >= 4) {
        clearFile = `teacher${this._charId}_happy.webp`;
      } else if (clearIntimacy >= 2) {
        clearFile = `teacher${this._charId}.webp`;
      } else if (clearIntimacy === 1) {
        clearFile = `teacher${this._charId}_cry.webp`;
      } else {
        clearFile = (this._app.state.gameMode === 2)
          ? `teacher${this._charId}_cry2.webp`
          : `teacher${this._charId}_cry.webp`;
      }
      this._charImg.src = this._app.getImgPath(clearFile);

      // 先生名を表示
      const teacherName = this._app.state.teacherNames[this._charId - 1] || `先生${this._charId}`;
      this._teacherName.textContent = teacherName;

      // ステージクリア総評メッセージをタイピング（得点別メッセージ）
      const scoreText = `【結果】${this._questions.length}問中${this._correctCount}問正解！`;
      const teacherMsgs = (this._clearMessages || {})[String(this._charId)] || {};
      const scoreMsgs = teacherMsgs[String(this._correctCount)] || [];
      const clearMsg = scoreMsgs.length > 0
        ? scoreMsgs[Math.floor(Math.random() * scoreMsgs.length)]
        : ((this._messages.clear || {})[this._charId]?.[0] || '');
      const playerName = this._app.state.playerName || '訓練生';
      const resolvedMsg = clearMsg.replace(/\{\{player\}\}/g, playerName);
      this._startTyping(scoreText + '\n' + resolvedMsg, this._msgText);

      // 次へボタン（遷移用テキスト）
      this._nextBtn.textContent = nextStage ? '次のステージへ ▶' : 'エンディングへ ▶';
      this._nextBtn.classList.remove('hidden');
    }
  }

  /** ステージクリア時の星パーティクル生成（quiz-clear-text の背後に表示） */
  _createClearParticles() {
    this._clearOverlay.querySelectorAll('.end-star').forEach(e => e.remove());
    const STAR_CHARS  = ['★', '✦', '✧', '◆', '✱', '✸'];
    const STAR_COLORS = ['#FFD700', '#FFA500', '#FF8C00', '#FFE566', '#FFCC00', '#FFC040'];
    const clearText   = document.getElementById('quiz-clear-text');
    for (let i = 0; i < 20; i++) {
      const el = document.createElement('span');
      el.className   = 'end-star';
      el.textContent = STAR_CHARS[i % STAR_CHARS.length];
      el.style.fontSize = (40 + Math.random() * 50) + 'px';
      el.style.color    = STAR_COLORS[i % STAR_COLORS.length];
      el.style.left = (15 + Math.random() * 70) + '%';
      el.style.top  = (0.5 + Math.random() * 14) + '%';
      el.style.animationDuration = (2.0 + Math.random() * 2.5) + 's';
      el.style.animationDelay   = (Math.random() * 3.5) + 's';
      // quiz-clear-text の前に挿入してテキストの背後に表示
      this._clearOverlay.insertBefore(el, clearText);
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
    if (!this._isTyping()) return;
    // _stopTyping()を呼ぶ前に参照を保存（stopTypingがnullにするため）
    const el   = this._typingEl;
    const full = this._typingFull;
    this._stopTyping();
    if (el && full) el.textContent = full;
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
