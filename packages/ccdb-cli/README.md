# CCDB CLI

npm 包为 `ccdb-cli`，命令为 `ccdb-cli`。独立二进制无需 Node.js；从官方仓库获取对应系统/架构版本。

独立的 CCDB 因子查询命令行。npm 版需要 Node.js 22+；独立二进制无需 Node.js。内含接口与认证代码，不需要安装 MCP 或 ccdb-client。

## 安装与使用

直接从 npm 安装，无需克隆源码或准备 tgz：

```sh
npm install -g ccdb-cli
ccdb-cli --version
ccdb-cli auth login --method device
ccdb-cli factor search "电力" --country "中国" --limit 5 --json
ccdb-cli factor detail "2232515359983616" --json
ccdb-cli doctor --json
ccdb-cli --help
```

固定版本：`npm install -g ccdb-cli@0.1.0`。镜像未同步时追加 `--registry=https://registry.npmjs.org/`。数据库访问仍需有效授权和可用后端。

### 认证选择：默认 device OAuth，API Key 为备选

`ccdb-cli auth login` 默认使用 device OAuth，等价于 `ccdb-cli auth login --method device`。终端给出授权链接和设备码，由用户在浏览器登录并授权；无浏览器终端可加 `--no-browser`。查询本身不会自动启动登录。

API Key 是用户主动选择的备选：由宿主 Secret 设置 `CCDB_API_KEY`，或使用 `ccdb-cli auth login --method api-key` 不回显输入。不要在命令参数、聊天或日志中粘贴完整 Key。

默认推荐顺序不改变显式配置：环境 `CCDB_API_KEY` 存在时仍优先于已保存凭证；恢复 OAuth 前应从实际执行环境中移除该变量并登录。没有环境 Key 时使用已保存凭证。OAuth 无法刷新时提示重新登录，不自动切换 Key；Key 失败也不自动切换 OAuth。PKCE 是通过 `--method pkce` 显式选择的另一种 OAuth 登录方式。

环境默认 production；本地需指定 `CCDB_PROFILE=local`，默认网关 8880、Agent 3100。OAuth client_id 默认 ccdb-connect-local，须在目标环境登记；联调可显式设置 CCDB_CLIENT_ID。可覆盖 CCDB_API_BASE、CCDB_AGENT_WEB、CCDB_OAUTH_ISSUER、CCDB_RESOURCE。

Windows 自动凭证存储使用 DPAPI；macOS/Linux 依赖本机 Keychain/Secret Service。无系统密钥服务时可显式选择 CCDB_AUTH_STORE=file（非加密文件），需自行限制本机访问。

`auth logout --revoke` 撤销整条应用授权，可能影响共享凭证的其他工具。默认 logout 只清理本地，不停用 API Key，也不移除环境变量。

数值受限 `******` 不可计算。候选不是最终推荐，须结合详情、单位、范围判断。
