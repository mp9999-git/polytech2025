/**
 * splash.js - スプラッシュ画面
 * アプリ起動直後に表示される最初の画面
 * タップで tryFullscreen() -> ローディング画面へ遷移
 */

class SplashScreen {
  constructor(app) {
    this._app = app;
    this._el  = document.getElementById("screen-splash");
  }

  show() {
    this._el.classList.remove("hidden", "splash-fadeout");
    this._el.classList.add("active");

    const onTap = (e) => {
      e.preventDefault();
      this._el.removeEventListener("touchend", onTap);
      this._el.removeEventListener("click", onTap);
      this._app.tryFullscreen();
      this._transitionToLoading();
    };

    // touchend: モバイルでフルスクリーンが確実に動作するよう優先
    this._el.addEventListener("touchend", onTap, { passive: false });
    // click: PC / フォールバック
    this._el.addEventListener("click", onTap);
  }

  _transitionToLoading() {
    this._el.classList.add("splash-fadeout");
    setTimeout(() => {
      this.hide();
      this._app.goToLoading();
    }, 700);
  }

  hide() {
    this._el.classList.remove("active", "splash-fadeout");
    this._el.classList.add("hidden");
  }
}

export default SplashScreen;
