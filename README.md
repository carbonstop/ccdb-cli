# CCDB Connect CLI

独立的 CCDB 因子查询命令行，Node.js 22+。内含接口与认证代码，不需要安装 MCP 或 ccdb-client。

开发包通过本地 tgz 安装；尚未发布到 npm。

```sh
ccdb-connect auth login --method device
ccdb-connect factor search "电力" --country "中国" --limit 5 --json
ccdb-connect factor detail "2232515359983616" --json
ccdb-connect doctor --json
ccdb-connect --help
```

API Key 由宿主设置 `CCDB_API_KEY`，或使用 `auth login --method api-key` 不回显输入。不要在命令参数、聊天或日志中粘贴完整 Key。

环境默认 production；本地需指定 `CCDB_PROFILE=local`，默认网关 8880、Agent 3100。OAuth client_id 默认 ccdb-connect-local，须在目标环境登记；联调可显式设置 CCDB_CLIENT_ID。可覆盖 CCDB_API_BASE、CCDB_AGENT_WEB、CCDB_OAUTH_ISSUER、CCDB_RESOURCE。

Windows 自动凭证存储使用 DPAPI；macOS/Linux 依赖本机 Keychain/Secret Service。无系统密钥服务时可显式选择 CCDB_AUTH_STORE=file（非加密文件），需自行限制本机访问。

`auth logout --revoke` 撤销整条应用授权，可能影响共享凭证的其他工具。默认 logout 只清理本地，不停用 API Key，也不移除环境变量。

数值受限 `******` 不可计算。候选不是最终推荐，须结合详情、单位、范围判断。

## Development

```sh
npm ci
npm run verify
```

Node.js 22+. Build and pack are local; no npm publication is performed.

## 只安装 CLI

在此目录用本地包安装（不会访问 npm 获取本包）：

```powershell
npm install -g ./dist/releases/carbonstop-ccdb-cli-0.1.0.tgz
ccdb-connect --help
ccdb-connect doctor --profile local --json
ccdb-connect auth login --profile local
ccdb-connect factor search 电力 --profile local --country 中国 --year 2024 --limit 5 --json
ccdb-connect factor detail 1234567890123456789 --profile local --json
```

最后的 factorId 仅为格式示例，必须替换为搜索响应中的真实字符串 ID。筛选项 `--country`、`--year`、`--source-level` 可以重复传入。

默认 device 登录：终端给出设备验证码及浏览器链接；在 Carbon Agent 登录并允许后，客户端轮询并保存凭证。无浏览器环境添加 `--no-browser`，在可用浏览器中打开终端显示的链接。PKCE 使用 `auth login --method pkce`，需要 `127.0.0.1:3210/callback` 已登记且该端口未被占用。

本地首次使用前，在 BOSS 登记并启用 OAuth 客户端 `ccdb-connect-local`（名称 CCDB Connect），授予 `authorization_code,refresh_token,device_code`、开启设备码、登记上述精确回调及三个 scope：`ccdb.factor.search ccdb.factor.read offline_access`。不会动态注册应用。若本地目前只有 `ccdb-integration-lab`，可以显式设置 `$env:CCDB_CLIENT_ID='ccdb-integration-lab'` 联调，不会偷偷改用它。

API Key 可替代 OAuth：

```powershell
ccdb-connect auth login --profile local --method api-key
ccdb-connect auth status --profile local --json
```

登录命令隐藏输入，也可从受控进程 stdin 提供完整 Key；不接受 `--api-key 明文`。`CCDB_API_KEY` 环境变量优先于已保存凭证，支持现有新旧格式，但必须是有 CCDB 权限的 Key。密钥格式不等于权限范围，旧碳云业务 Key 不会自动升级。

`auth logout` 只清理本机保存的凭证；`auth logout --revoke` 还撤销整条 OAuth 应用授权，可能影响共用授权的 MCP/CLI/Skill。环境变量提供的 Key 必须从环境中另行移除。

See [configuration](docs/CONFIGURATION.md), [migration](docs/MIGRATION.md), and [factor guidance](docs/FACTOR_GUIDANCE.md).
