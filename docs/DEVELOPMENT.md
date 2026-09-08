# 开发指南

## PKCE 授权结果页

已同步 ccdb-integrations 提交 `2fb30a5`：本地 PKCE 回调在完成授权码换取和凭证保存后，返回 Carbon Agent 授权页面，并通过 URL fragment 携带 success、error 或 cancelled 结果。返回地址取自已校验的授权页，不接受回调参数指定跳转目标，不携带 code、Token 或 verifier。Agent 前端需要配套支持结果展示并停止再次自动跳转；默认 device 登录和 API Key 不变。

对应回归测试位于 `tests/callback.test.ts`。此修复仅涉及本地登录，不代表远程 MCP 架构已实现或完成联调。

在仓库根目录运行：

```sh
npm ci
npm run verify
npm install -g ./dist/releases/ccdb-cli-0.1.1.tgz
```

`verify` 会构建并生成本地 tgz；最后一行仅用于测试刚构建的本地版本。构建不会自动发布 npm。

## 本地调试

安装 CLI 并启动本地后端后，选择 local 环境：

```powershell
ccdb-cli --help
ccdb-cli doctor --profile local --json
ccdb-cli auth login --profile local
ccdb-cli factor search 电力 --profile local --country 中国 --year 2024 --limit 5 --json
ccdb-cli factor detail 1234567890123456789 --profile local --json
```

最后的 factorId 仅为格式示例，必须替换为搜索响应中的真实字符串 ID。筛选项 `--country`、`--year`、`--source-level` 可以重复传入。

默认 device 登录：终端给出设备验证码及浏览器链接；在 Carbon Agent 登录并允许后，客户端轮询并保存凭证。无浏览器环境添加 `--no-browser`，在可用浏览器中打开终端显示的链接。PKCE 使用 `auth login --method pkce`，需要 `127.0.0.1:3210/callback` 已登记且该端口未被占用。

本地首次使用前，在 BOSS 登记并启用 OAuth 客户端 `ccdb-connect-local`（名称 CCDB Connect），授予 `authorization_code,refresh_token,device_code`、开启设备码、登记上述精确回调及三个 scope：`ccdb.factor.search ccdb.factor.read offline_access`。不会动态注册应用。若本地目前只有 `ccdb-integration-lab`，可以显式设置 `$env:CCDB_CLIENT_ID='ccdb-integration-lab'` 联调，不会偷偷改用它。

API Key 可替代 OAuth：

```powershell
ccdb-cli auth login --profile local --method api-key
ccdb-cli auth status --profile local --json
```

登录命令隐藏输入，也可从受控进程 stdin 提供完整 Key；不接受 `--api-key 明文`。`CCDB_API_KEY` 环境变量优先于已保存凭证，支持现有新旧格式，但必须是有 CCDB 权限的 Key。密钥格式不等于权限范围，旧碳云业务 Key 不会自动升级。

`auth logout` 只清理本机保存的凭证；`auth logout --revoke` 还撤销整条 OAuth 应用授权，可能影响共用授权的 MCP/CLI/Skill。环境变量提供的 Key 必须从环境中另行移除。
