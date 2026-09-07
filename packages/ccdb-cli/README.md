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
