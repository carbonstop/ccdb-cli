# CCDB CLI

命令：`ccdb-cli`；npm 包：`ccdb-cli`。另提供无需 Node.js 的独立二进制，构建、下载与发布见 [分发说明](docs/DISTRIBUTION.md)。

独立的 CCDB 因子查询命令行。npm 版需要 Node.js 22+；独立二进制无需 Node.js。内含接口与认证代码，不需要安装 MCP 或 ccdb-client。

## 从 npm 安装（推荐）

已发布 [ccdb-cli](https://www.npmjs.com/package/ccdb-cli)，无需克隆仓库或先构建：

```sh
npm install -g ccdb-cli
ccdb-cli --version
ccdb-cli auth login --method device
ccdb-cli factor search "电力" --country "中国" --limit 5 --json
ccdb-cli factor detail "2232515359983616" --json
ccdb-cli doctor --json
ccdb-cli --help
```

需要固定版本时使用 `npm install -g ccdb-cli@0.1.0`。若国内镜像尚未同步，可追加 `--registry=https://registry.npmjs.org/`。安装成功不等于取得数据库权限，查询仍需服务端可用并完成授权。

### 认证选择：默认 device OAuth，API Key 为备选

`ccdb-cli auth login` 默认使用 device OAuth，等价于 `ccdb-cli auth login --method device`。终端给出授权链接和设备码，由用户在浏览器登录并授权；无浏览器终端可加 `--no-browser`。查询本身不会自动启动登录。

API Key 是用户主动选择的备选：由宿主 Secret 设置 `CCDB_API_KEY`，或使用 `ccdb-cli auth login --method api-key` 不回显输入。不要在命令参数、聊天或日志中粘贴完整 Key。

默认推荐顺序不改变显式配置：环境 `CCDB_API_KEY` 存在时仍优先于已保存凭证；恢复 OAuth 前应从实际执行环境中移除该变量并登录。没有环境 Key 时使用已保存凭证。OAuth 无法刷新时提示重新登录，不自动切换 Key；Key 失败也不自动切换 OAuth。PKCE 是通过 `--method pkce` 显式选择的另一种 OAuth 登录方式。

环境默认 production；本地需指定 `CCDB_PROFILE=local`，默认网关 8880、Agent 3100。OAuth client_id 默认 ccdb-connect-local，须在目标环境登记；联调可显式设置 CCDB_CLIENT_ID。可覆盖 CCDB_API_BASE、CCDB_AGENT_WEB、CCDB_OAUTH_ISSUER、CCDB_RESOURCE。

Windows 自动凭证存储使用 DPAPI；macOS/Linux 依赖本机 Keychain/Secret Service。无系统密钥服务时可显式选择 CCDB_AUTH_STORE=file（非加密文件），需自行限制本机访问。

`auth logout --revoke` 撤销整条应用授权，可能影响共享凭证的其他工具。默认 logout 只清理本地，不停用 API Key，也不移除环境变量。

数值受限 `******` 不可计算。候选不是最终推荐，须结合详情、单位、范围判断。

## 从源码开发（仅开发人员）

以下命令在克隆的仓库根目录运行，不是普通用户的安装前置步骤：

```sh
npm ci
npm run verify
npm install -g ./dist/releases/ccdb-cli-0.1.0.tgz
```

`verify` 会构建并生成本地 tgz；最后一行仅用于测试刚构建的本地版本。构建不会自动发布 npm。

## 本地后端联调（仅开发人员）

已安装 CLI 且本地后端已启动时，可显式选择 local 环境；普通用户无需使用这些本地地址：

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

See [configuration](docs/CONFIGURATION.md), [migration](docs/MIGRATION.md), and [factor guidance](docs/FACTOR_GUIDANCE.md).
