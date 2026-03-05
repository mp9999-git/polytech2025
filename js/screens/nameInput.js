/**
 * nameInput.js - 名前入力画面（訓練生名 + 先生名スライドパネル）
 *
 * 【画面構成】
 *  ① 訓練生名の入力（1ページ目）
 *  ② 先生名のカスタマイズ（スライドパネルで展開）
 *  「登録して次へ」ボタンで state に保存し、最初のストーリー画面へ進む
 *
 * 【先生名の自動生成】
 *  teacher_names.json に入った苗字リストから5名ぶんをランダムに選び
 *  入力欄の初期値として設定する（重複なし）
 */

class NameInputScreen {
  constructor(app) {
    this._app = app;
    this._el  = document.getElementById('screen-name-input');
    this._slideContainer = document.getElementById('name-input-slide-container');
    this._traineeInput   = document.getElementById('trainee-name-input');
    this._teacherInputs  = document.querySelectorAll('.teacher-name-input');
    this._teacherNames   = null; // JSONから読み込んだ名前一覧

    document.getElementById('btn-register-next').addEventListener('click', () => {
      this._onRegisterNext();
    });

    // エンターキーで「登録して次へ」ボタンにフォーカス移動（スマホキーボードを閉じるため）
    this._traineeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-register-next').focus();
      }
    });

    document.getElementById('btn-shuffle-teachers').addEventListener('click', () => {
      this._app.sound.playSE('button');
      this._shuffleTeacherNames();
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      this._onStartGame();
    });

    document.getElementById('name-back-btn').addEventListener('click', () => {
      app.sound.playSE('button');
      app.goToTitle();
    });
  }

  /** 表示 */
  async show() {
    this._el.classList.remove('hidden');
    this._el.classList.add('active');
    // スライドをリセット（フェーズ1に戻す）
    this._slideContainer.classList.remove('slide-left');
    this._traineeInput.value = this._app.state.playerName || '';

    // 背景画像をモードに応じて設定
    document.getElementById('name-input-bg').src = this._app.getImgPath('polytech_outside.webp');
    document.getElementById('name-input-gif').src = this._app.getImgPath('polytech_run.webp');

    this._app.sound.playBGM('name_input');

    // 先生名をJSONから読み込み
    if (!this._teacherNames) {
      this._teacherNames = this._app.dataCache?.['assets/data/teacher_names.json'] || null;
      if (!this._teacherNames) {
        try {
          const res = await fetch('assets/data/teacher_names.json');
          this._teacherNames = await res.json();
        } catch (e) {
          this._teacherNames = [];
        }
      }
    }
  }

  hide() {
    this._el.classList.remove('active');
    this._el.classList.add('hidden');
  }

  /** 「登録して次へ」クリック */
  _onRegisterNext() {
    const name = this._traineeInput.value.trim();
    if (!name) {
      this._shakeInput(this._traineeInput);
      return;
    }
    this._app.sound.playSE('button');
    this._app.state.playerName = name;

    // 先生名テキストボックスに初期値をセット（ランダム5件）
    this._fillTeacherNames();

    // 右スライド
    this._slideContainer.classList.add('slide-left');
  }

  /** 先生名テキストボックスに性別別ランダム5件をセット */
  _fillTeacherNames() {
    // Network:男, PLC:男, Database:男, Java:女, Android:男
    const GENDER_MAP = ['male', 'male', 'male', 'female', 'male'];
    const malePool   = [...(this._teacherNames?.male   || [])];
    const femalePool = [...(this._teacherNames?.female || [])];

    this._teacherInputs.forEach((input, i) => {
      // 既存の保存値があれば優先
      const saved = this._app.state.teacherNames[i];
      if (saved && saved !== `先生${i + 1}`) {
        input.value = saved;
      } else {
        const pool = GENDER_MAP[i] === 'male' ? malePool : femalePool;
        const idx  = Math.floor(Math.random() * pool.length);
        input.value = pool.splice(idx, 1)[0] || `先生${i + 1}`;
      }
    });
  }

  /** シャッフルボタン: 保存値を無視して常にランダム生成 */
  _shuffleTeacherNames() {
    const GENDER_MAP = ['male', 'male', 'male', 'female', 'male'];
    const malePool   = [...(this._teacherNames?.male   || [])];
    const femalePool = [...(this._teacherNames?.female || [])];
    this._teacherInputs.forEach((input, i) => {
      const pool = GENDER_MAP[i] === 'male' ? malePool : femalePool;
      const idx  = Math.floor(Math.random() * pool.length);
      input.value = pool.splice(idx, 1)[0] || `先生${i + 1}`;
    });
  }

  /** 「決定して開始」クリック */
  _onStartGame() {
    this._app.sound.playSE('start');
    const names = [];
    this._teacherInputs.forEach((input, i) => {
      names.push(input.value.trim() || `先生${i + 1}`);
    });
    this._app.state.teacherNames = names;
    this._app.saveState();
    this._app.goToStory('Network');
  }

  /** 入力欄を揺らすアニメーション */
  _shakeInput(el) {
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }
}

export default NameInputScreen;
