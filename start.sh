#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "    HengBeGer 项目一键启动脚本"
echo "========================================"
echo

echo "[1/5] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 Node.js，请先安装 Node.js${NC}"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✅ Node.js 环境检查通过${NC}"

echo
echo "[2/5] 检查项目依赖..."
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 正在安装项目依赖...${NC}"
    npm install --legacy-peer-deps
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 依赖安装失败${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ 依赖安装完成${NC}"
else
    echo -e "${GREEN}✅ 项目依赖已存在${NC}"
fi

echo
echo "[3/5] 检查环境配置..."
if [ ! -f ".env" ]; then
    echo -e "${BLUE}📝 创建环境配置文件...${NC}"
    cp ".env.example" ".env"
    echo -e "${YELLOW}⚠️  请编辑 .env 文件设置数据库密码${NC}"
    echo "文件位置: $(pwd)/.env"
    echo
    echo "按 Enter 键继续..."
    read
fi
echo -e "${GREEN}✅ 环境配置检查完成${NC}"

echo
echo "[4/5] 检查 MySQL 服务..."
if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet mysql || systemctl is-active --quiet mysqld; then
        echo -e "${GREEN}✅ MySQL 服务正在运行${NC}"
    else
        echo -e "${YELLOW}⚠️  MySQL 服务未运行，请确保 MySQL 已安装并启动${NC}"
        echo "如需初始化数据库，请运行: npm run init-db"
    fi
elif command -v brew &> /dev/null; then
    if brew services list | grep mysql | grep started &> /dev/null; then
        echo -e "${GREEN}✅ MySQL 服务正在运行${NC}"
    else
        echo -e "${YELLOW}⚠️  MySQL 服务未运行，请确保 MySQL 已安装并启动${NC}"
        echo "如需初始化数据库，请运行: npm run init-db"
    fi
else
    echo -e "${YELLOW}⚠️  无法检查 MySQL 服务状态，请手动确认 MySQL 已启动${NC}"
fi

echo
echo "[5/5] 启动项目服务..."
echo -e "${BLUE}🚀 正在启动前端和后端服务...${NC}"
echo
echo "前端地址: http://localhost:5173/"
echo "后端地址: http://localhost:3001/"
echo
echo "按 Ctrl+C 停止服务"
echo "========================================"
echo

npm start