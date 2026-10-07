@echo off
echo ========================================
echo     MySQL密码重置工具
echo ========================================
echo.
echo 此工具将帮助您重置MySQL root密码
echo 请确保以管理员权限运行此脚本
echo.
pause

echo 正在停止MySQL服务...
net stop MySQL80
if %errorlevel% neq 0 (
    echo 停止MySQL服务失败，请检查服务名称
    pause
    exit /b 1
)

echo.
echo 正在以安全模式启动MySQL...
echo 请在新打开的命令窗口中执行以下命令:
echo.
echo mysqld --skip-grant-tables --skip-networking
echo.
echo 然后按任意键继续...
start cmd /k "mysqld --skip-grant-tables --skip-networking"
pause

echo.
echo 正在连接到MySQL并重置密码...
echo 请在新打开的命令窗口中执行以下命令:
echo.
echo mysql -u root
echo FLUSH PRIVILEGES;
echo ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密码';
echo EXIT;
echo.
echo 注意：请把"你的新密码"替换成一个强密码（字母+数字+符号，至少12位），
echo 并同步更新项目 .env 文件中的 DB_PASSWORD=你的新密码
echo.
start cmd /k "mysql -u root"
pause

echo.
echo 正在重启MySQL服务...
taskkill /f /im mysqld.exe
net start MySQL80

echo.
echo ========================================
echo 密码重置完成！
echo 请使用你设置的新密码连接 MySQL
echo 并确认 .env 中 DB_PASSWORD 已同步
echo ========================================
pause