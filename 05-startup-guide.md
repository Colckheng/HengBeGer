# HengBeGer 项目启动指南

本项目提供了多种启动方式，方便不同场景下的使用。所有启动方式都会自动完成环境检查、依赖安装、配置文件创建等步骤，真正实现一键启动。

## 🚀 一键启动方式

### 方式一：使用 Node.js 启动器（推荐）

**智能启动器特性**：
- ✅ 自动检查 Node.js 环境版本
- ✅ 自动安装项目依赖（如果缺失）
- ✅ 自动创建环境配置文件（从 .env.example 复制）
- ✅ 检查 MySQL 服务状态并给出启动提示
- ✅ 支持多种启动模式
- ✅ 彩色输出和进度提示
- ✅ 优雅的错误处理和用户指导

```bash
# 启动完整项目（前端 + 后端）
npm run launch
# 或者
npm run quick-start

# 仅启动前端开发服务器
npm run launch:frontend

# 仅启动后端 API 服务器
npm run launch:backend

# 查看帮助信息
node launcher.js --help
```

**启动流程说明**：
1. **[1/5] 检查 Node.js 环境** - 验证 Node.js 是否已安装及版本信息
2. **[2/5] 检查项目依赖** - 检查 node_modules 是否存在，如无则自动安装
3. **[3/5] 检查环境配置** - 检查 .env 文件，如无则从 .env.example 复制
4. **[4/5] 检查 MySQL 服务** - 检查 MySQL 服务运行状态
5. **[5/5] 启动项目服务** - 根据指定模式启动相应服务

### 方式二：使用批处理文件（Windows）

**适用场景**：Windows 系统用户，喜欢图形化操作

**使用方法**：
```cmd
# 方法1：双击运行（推荐）
双击 start.bat 文件

# 方法2：命令行执行
start.bat
```

**功能特性**：
- ✅ 自动检查 Node.js 环境
- ✅ 自动安装项目依赖
- ✅ 自动创建 .env 配置文件
- ✅ 检查 MySQL 服务状态
- ✅ 中文界面友好提示
- ✅ 错误处理和用户指导

### 方式三：使用 Shell 脚本（Linux/macOS）

**适用场景**：Linux/macOS 系统用户

**使用方法**：
```bash
# 添加执行权限（首次使用）
chmod +x start.sh

# 运行脚本
./start.sh
```

**功能特性**：
- ✅ 跨平台兼容性（支持 systemctl 和 brew）
- ✅ 彩色终端输出
- ✅ 自动环境检查和依赖安装
- ✅ MySQL 服务状态智能检测
- ✅ 完整的错误处理机制

### 方式四：传统方式

```bash
# 安装依赖
npm install --legacy-peer-deps

# 启动完整项目
npm start

# 或分别启动
npm run server  # 后端服务器
npm run dev     # 前端开发服务器
```

## 📖 如何使用一键启动

### 🎯 快速开始（推荐新手）

**第一次使用**：
1. **克隆项目**：
   ```bash
   git clone <项目地址>
   cd HengBeGer
   ```

2. **一键启动**：
   ```bash
   npm run launch
   ```
   
3. **等待自动配置**：
   - 启动器会自动检查环境
   - 自动安装依赖（首次需要几分钟）
   - 自动创建配置文件
   
4. **配置数据库密码**：
   - 编辑生成的 `.env` 文件
   - 设置 `DB_PASSWORD=你的MySQL密码`
   
5. **初始化数据库**：
   ```bash
   npm run init-db
   ```

6. **重新启动**：
   ```bash
   npm run launch
   ```

### 🔄 日常使用

**启动完整项目**：
```bash
npm run launch
# 或者双击 start.bat（Windows）
# 或者运行 ./start.sh（Linux/macOS）
```

**仅开发前端**：
```bash
npm run launch:frontend
```

**仅开发后端**：
```bash
npm run launch:backend
```

### ⚠️ 注意事项

1. **首次启动**：需要安装依赖，请耐心等待
2. **MySQL 配置**：确保 MySQL 服务已启动并配置正确密码
3. **端口占用**：确保 3001 和 5173 端口未被占用
4. **网络环境**：依赖安装需要良好的网络环境
5. **权限问题**：Linux/macOS 用户需要给 start.sh 添加执行权限

## 📋 启动前准备

### 1. 环境要求

- **Node.js**: 版本 16.0 或更高
- **MySQL**: 版本 5.7 或更高
- **npm**: 版本 7.0 或更高

### 2. 环境配置

1. **复制环境配置文件**：
   ```bash
   cp .env.example .env
   ```

2. **编辑 `.env` 文件**，设置数据库密码：
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=hengbeger
   DB_PORT=3306
   
   SERVER_PORT=3001
   ```

### 3. 数据库初始化

```bash
# 初始化数据库（首次使用）
npm run init-db
```

## 🔧 启动器功能说明

### Node.js 启动器 (launcher.js)

**核心功能**：
- ✅ **环境检测**：自动检查 Node.js 版本兼容性
- ✅ **依赖管理**：智能检测并安装缺失的 npm 依赖
- ✅ **配置管理**：自动从 .env.example 创建 .env 文件
- ✅ **服务检查**：跨平台检查 MySQL 服务运行状态
- ✅ **多模式启动**：支持前端、后端、全栈三种启动模式
- ✅ **用户体验**：彩色输出、进度提示、错误指导
- ✅ **进程管理**：优雅的服务启动和停止处理

**启动模式详解**：
- `both`（默认）：使用 concurrently 同时启动前端和后端服务
- `frontend`：仅启动 Vite 开发服务器（端口 5173）
- `backend`：仅启动 Express API 服务器（端口 3001）

**技术实现**：
- 使用 ES6 模块和 Node.js 子进程管理
- 跨平台兼容（Windows/Linux/macOS）
- 支持命令行参数和帮助信息
- 实现了完整的错误处理和用户反馈机制

### 批处理文件 (start.bat)

**适用于**：Windows 系统用户
**功能**：
- 环境检查
- 依赖安装
- 配置文件创建
- 服务启动

### Shell 脚本 (start.sh)

**适用于**：Linux/macOS 系统用户
**功能**：
- 跨平台兼容性
- 彩色输出
- 服务状态检查
- 自动化启动流程

## 🌐 访问地址

启动成功后，可以通过以下地址访问：

- **前端应用**: http://localhost:5173/
- **后端 API**: http://localhost:3001/
- **健康检查**: http://localhost:3001/health

## 🛠️ 故障排除

### 常见问题及解决方案

#### 1. 依赖安装相关问题

**问题**：`npm install` 失败或依赖冲突
```bash
# 解决方案1：清除缓存重新安装
npm cache clean --force
rm -rf node_modules package-lock.json  # Linux/macOS
rmdir /s node_modules & del package-lock.json  # Windows
npm install --legacy-peer-deps

# 解决方案2：使用不同的包管理器
yarn install  # 或
pnpm install
```

#### 2. 数据库连接问题

**问题**：数据库连接失败或初始化失败
```bash
# 检查MySQL服务状态
# Windows:
sc query mysql
net start mysql  # 启动服务

# Linux/macOS:
sudo systemctl status mysql
sudo systemctl start mysql  # 启动服务

# 检查配置文件
cat .env  # 确认数据库配置正确

# 重新初始化数据库
npm run init-db
```

#### 3. 端口占用问题

**问题**：端口 3001 或 5173 被占用
```bash
# 查看端口占用
# Windows:
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# Linux/macOS:
lsof -i :3001
lsof -i :5173

# 杀死占用进程（谨慎操作）
# Windows:
taskkill /PID <进程ID> /F

# Linux/macOS:
kill -9 <进程ID>
```

#### 4. 权限问题（Linux/macOS）

**问题**：脚本无执行权限
```bash
# 添加执行权限
chmod +x start.sh
chmod +x launcher.js

# 检查权限
ls -la start.sh
ls -la launcher.js
```

#### 5. Node.js 版本问题

**问题**：Node.js 版本过低或不兼容
```bash
# 检查当前版本
node --version
npm --version

# 推荐使用 Node.js 16+ 版本
# 使用 nvm 管理版本（推荐）
nvm install 18
nvm use 18
```

#### 6. 环境配置问题

**问题**：.env 文件配置错误
```bash
# 重新创建配置文件
cp .env.example .env

# 编辑配置文件
# Windows:
notepad .env

# Linux/macOS:
nano .env
# 或
vim .env
```

### 日志查看

- 前端开发服务器日志会直接显示在终端
- 后端服务器日志包含数据库连接状态和 API 请求信息
- 如有错误，请查看终端输出的详细错误信息

## 📚 开发模式

### 热重载开发

```bash
# 启动开发模式（支持热重载）
npm run launch:frontend  # 前端热重载
npm run launch:backend   # 后端需手动重启
```

### 生产构建

```bash
# 构建前端项目
npm run build

# 预览构建结果
npm run preview
```

## 🔄 停止服务

在任何启动方式下，都可以使用 `Ctrl + C` 来停止服务。

---

## 🎉 总结

### 一键启动功能的优势

1. **零配置启动**：无需手动安装依赖、创建配置文件
2. **智能检测**：自动检测环境问题并给出解决建议
3. **跨平台支持**：Windows、Linux、macOS 全平台兼容
4. **多种启动方式**：命令行、批处理、Shell脚本任选
5. **用户友好**：彩色输出、进度提示、详细错误信息
6. **开发效率**：快速启动开发环境，专注于代码开发

### 推荐使用方式

- **新手用户**：推荐使用 `npm run launch` 或双击 `start.bat`
- **开发者**：根据需要选择前端、后端或全栈启动模式
- **生产环境**：使用传统方式进行部署配置

### 最佳实践

1. **首次使用**：运行 `npm run launch` 让系统自动配置
2. **日常开发**：根据开发需求选择合适的启动模式
3. **遇到问题**：查看终端输出的详细错误信息和建议
4. **定期维护**：定期更新依赖和清理缓存

**💡 提示**：首次使用建议使用 `npm run launch` 命令，它会自动完成所有必要的检查和配置，让您快速体验项目功能！