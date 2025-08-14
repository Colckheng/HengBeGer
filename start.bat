@echo off
chcp 65001 >nul
echo ========================================
echo    HengBeGer 项目一键启动脚本
echo ========================================
echo.

echo [1/5] 检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 环境检查通过

echo.
echo [2/5] 检查项目依赖...
if not exist "node_modules" (
    echo 📦 正在安装项目依赖...
    npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 项目依赖已存在
)

echo.
echo [3/5] 检查环境配置...
if not exist ".env" (
    echo 📝 创建环境配置文件...
    copy ".env.example" ".env" >nul
    echo ⚠️  请编辑 .env 文件设置数据库密码
    echo 文件位置: %cd%\.env
    echo.
    echo 按任意键继续...
    pause >nul
)
echo ✅ 环境配置检查完成

echo.
echo [4/5] 检查 MySQL 服务...
sc query mysql >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  MySQL 服务未运行，请确保 MySQL 已安装并启动
    echo 如需初始化数据库，请运行: npm run init-db
) else (
    echo ✅ MySQL 服务正在运行
)

echo.
echo [5/5] 启动项目服务...
echo 🚀 正在启动前端和后端服务...
echo.
echo 前端地址: http://localhost:5173/
echo 后端地址: http://localhost:3001/
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

npm start