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
echo USE mysql;
echo UPDATE user SET authentication_string=PASSWORD('') WHERE User='root';
echo FLUSH PRIVILEGES;
echo EXIT;
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
echo 现在可以使用空密码连接MySQL
echo ========================================
pause