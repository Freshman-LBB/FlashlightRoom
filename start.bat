@echo off
chcp 65001 >nul
echo ========================================
echo FlashlightRoom
echo ========================================
echo.

REM 检查Python是否可用
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [√] 检测到 Python
    echo.
    echo 正在启动服务器...
    echo 服务器地址: http://localhost:8000
    echo.
    echo 按 Ctrl+C 停止服务器
    echo ========================================
    echo.
    python -m http.server 8000
) else (
    echo [×] 未检测到 Python
    echo.
    echo 请选择以下方式之一启动：
    echo.
    echo 方法1: 安装 Python
    echo   下载地址: https://www.python.org/downloads/
    echo   安装后重新运行此脚本
    echo.
    echo 方法2: 使用 Node.js
    echo   如果已安装 Node.js，运行: npx http-server -p 8000
    echo.
    echo 方法3: 使用 VS Code Live Server 扩展
    echo   右键点击 index.html 选择 "Open with Live Server"
    echo.
    pause
)

