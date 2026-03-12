@echo off

:: ゲームフォルダのパスを環境変数にセット（PowerShell側で読む）
set "POLYTECH_ROOT=%~dp0"

:: server.ps1 を %TEMP%（ASCIIパス）にコピーしてから実行
:: → 日本語フォルダ名をPowerShellの-Fileパラメータに渡す問題を回避
set "TMPPS=%TEMP%\polytech_server.ps1"
copy /y "%~dp0server.ps1" "%TMPPS%" > nul 2>&1

:: サーバーを別ウィンドウで起動（%TMPPS%はASCIIパスなので安全）
start "Polytech Memorial Server" powershell -ExecutionPolicy Bypass -NoExit -File "%TMPPS%"

:: サーバーが立ち上がるまで3秒待つ
timeout /t 3 /nobreak > nul

:: ブラウザを開く
start "" "http://localhost:8765"
