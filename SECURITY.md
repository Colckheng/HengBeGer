# 安全配置指南

本文档提供了 HengBeGer 项目的安全配置指南和最佳实践。

## 🔒 安全功能概述

项目包含以下安全功能：

- **敏感信息保护**: 自动掩码日志中的密码、密钥等敏感信息
- **密码强度验证**: 验证数据库密码强度
- **环境配置检查**: 检查生产环境配置安全性
- **安全日志记录**: 记录安全相关事件
- **自动安全检查**: 启动时自动执行安全验证

## 🛠️ 安全配置步骤

### 1. 环境变量配置

复制 `.env.example` 为 `.env` 并配置以下变量：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_secure_password_here  # 使用强密码
DB_NAME=HengBeGer

# 服务器配置
PORT=3001
NODE_ENV=development  # 生产环境设置为 'production'
```

### 2. 密码安全要求

数据库密码必须满足以下要求：

- **长度**: 至少 8 位字符
- **复杂度**: 包含大写字母、小写字母、数字和特殊字符
- **强度**: 避免使用常见弱密码（如 'password', '123456' 等）

#### 静音弱密码提示（开发环境）
- 在开发环境下，如需关闭弱密码强度提示，可设置环境变量：
  ```bash
  SECURITY_SILENCE=true
  ```
- 生产环境不建议静音安全提示，除非完全理解并接受风险

### 3. 生成安全密码

使用内置工具生成安全密码：

```bash
# 生成安全密码
npm run generate-password

# 或者使用交互式密码设置
npm run setup-password
```

### 4. 安全检查

运行安全检查以验证配置：

```bash
# 运行完整安全检查
npm run security-check
```

## 🔍 安全检查项目

安全检查包含以下项目：

### 环境变量检查
- ✅ DB_PASSWORD 是否已设置
- ✅ 是否使用默认密码
- ✅ 密码强度是否符合要求

### 生产环境检查
- ✅ 数据库主机配置
- ✅ 数据库用户权限
- ✅ 端口配置
- ✅ 环境变量设置

### 密码强度检查
- ✅ 长度要求（≥8位）
- ✅ 字符复杂度
- ✅ 常见弱密码检测

## 🚨 安全事件日志

系统会自动记录以下安全事件：

- 密码强度不足
- 环境配置安全问题
- 数据库连接失败
- 敏感信息访问

日志文件位置：`logs/security.log`

## 🏭 生产环境安全

### 必要配置

1. **环境变量**:
   ```bash
   NODE_ENV=production
   DB_PASSWORD=<strong_password>
   SECURITY_SILENCE=false
   ```

2. **数据库安全**:
   - 使用专用数据库用户（非 root）
   - 配置防火墙规则
   - 启用 SSL/TLS 连接

3. **服务器安全**:
   - 使用 HTTPS
   - 配置适当的 CORS 策略
   - 启用安全头部

### 安全检查失败处理

生产环境下，如果安全检查失败，系统将：
- 拒绝启动服务
- 记录详细错误日志
- 返回非零退出码

## 🔧 安全工具使用

### SecurityManager 类

```javascript
import { securityManager } from './src/utils/security.js';

// 检查敏感字段
const isSensitive = securityManager.isSensitiveField('password');

// 掩码敏感数据
const masked = securityManager.maskSensitiveData('secret123');

// 清理日志对象
const sanitized = securityManager.sanitizeForLogging({
  username: 'user',
  password: 'secret'
});

// 验证密码强度
const validation = securityManager.validatePasswordStrength('myPassword');

// 生成安全密码
const password = securityManager.generateSecurePassword(16);
```

### 环境安全验证

```javascript
import { validateEnvironmentSecurity } from './src/utils/security.js';

const validation = validateEnvironmentSecurity();
if (!validation.isSecure) {
  console.log('安全问题:', validation.issues);
}
```

## 📋 安全检查清单

部署前请确认：

- [ ] 已设置强密码
- [ ] 运行了安全检查
- [ ] 配置了生产环境变量
- [ ] 检查了文件权限
- [ ] 更新了依赖包
- [ ] 启用了 HTTPS
- [ ] 配置了防火墙

## 🚨 安全事件响应

如果发现安全问题：

1. **立即行动**:
   - 停止受影响的服务
   - 更改所有相关密码
   - 检查日志文件

2. **调查分析**:
   - 确定影响范围
   - 分析攻击向量
   - 收集证据

3. **修复措施**:
   - 修补安全漏洞
   - 更新安全配置
   - 加强监控

4. **预防措施**:
   - 定期安全检查
   - 更新依赖包
   - 安全培训

## 📞 安全支持

如需安全相关支持，请：

1. 查看项目文档
2. 运行 `npm run security-check`
3. 检查日志文件
4. 联系项目维护者

## 🔄 定期维护

建议定期执行：

```bash
# 每周执行
npm audit                    # 检查依赖漏洞
npm run security-check       # 运行安全检查

# 每月执行
npm audit fix               # 修复依赖漏洞
npm update                  # 更新依赖包
```

---

**注意**: 安全是一个持续的过程，请定期检查和更新安全配置。
## 🔧 初始化行为与门禁

- 仅在开发或显式设置 `INIT_DB=true` 时允许破坏性初始化（例如 `sync({ force: true })` 或清理表）
- 生产环境默认使用非破坏性 `sync({ alter: true })`，避免误删数据