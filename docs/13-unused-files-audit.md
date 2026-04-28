# 无用文件清理记录

更新时间：2026-04-06

这份文档记录 2026-04-06 这次仓库清理的最终结果。判断标准仍然是“当前代码入口、脚本入口、运行时引用”，但下面列出的项目已经实际删除，不再只是待处理清单。

## 已删除项目

### 已确认无引用的文件

- `src/Admin.css`
- `src/assets/react.svg`
- `src/assets/新建 文本文档.txt`
- `src/assets/zzz/Agent/alice.webp`
- `src/assets/zzz/Agent/alice1.htm`
- `src/assets/zzz/Agent/alice1.webp`
- `temp_debug.js`
- `test-data.html`

### 生成物 / 历史产物

- `dist/`
- `src/db/storage/backup/`
- `backup_storage/`
- `.codex-server.log`
- `.codex-frontend.log`

## 本次顺手补的忽略规则

为了避免本地历史目录再次出现在工作区，本次同时补充了以下 `.gitignore` 规则：

- `.vs/`
- `backup_storage/`

## 暂未归为“无用”的文件

下面这些文件虽然不是主运行链路的一部分，但仍然有明确用途，因此这次没有删除：

- `launcher.js`
- `start.bat`
- `start.sh`
- `setup-mysql-password.js`
- `security-check.js`
- `reset-mysql-password.bat`
- `src/DataTest.jsx`

保留原因：

- 它们仍然是手动入口、npm script 入口、故障处理脚本，或在路由里还有显式引用
