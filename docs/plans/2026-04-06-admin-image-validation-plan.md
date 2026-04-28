# Admin Image Validation Implementation Plan

日期：2026-04-06

## 实施步骤

1. 新增共享图片校验工具
2. 在 `AdminPanel.jsx` 中接入校验逻辑
3. 在 `HsrAdminPanel.jsx` 中接入相同逻辑
4. 补前端测试，覆盖：
   - 超过 2MB 被拦截
   - 非图片类型被拦截
   - 合法图片正常进入读取流程
5. 跑最小前端测试

## 验收点

- ZZZ 与 HSR 管理页规则一致
- 非法文件不会写入 `formData.image`
- 非法文件不会生成预览
- 用户能看到明确错误提示
