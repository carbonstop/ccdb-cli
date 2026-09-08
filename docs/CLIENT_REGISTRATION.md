# 后端登记交接：应用 × 环境

以下是 CLI/本地 stdio MCP 新版默认 ID；代码映射不代表后端登记已完成。

| profile | CLI | 本地 stdio MCP |
| --- | --- | --- |
| local | ccdb-cli-local | ccdb-mcp-local |
| test | ccdb-cli-test | ccdb-mcp-test |
| pre | ccdb-cli-pre | ccdb-mcp-pre |
| production | ccdb-cli-prod | ccdb-mcp-prod |

请在对应环境授权服务器分别登记并启用所需客户端，不混用环境数据库。每个应用同环境的用户共用公开 client_id，各自登录获得用户 Token，不为每位用户创建 OAuth 客户端。

1. 默认设备码授权：启用 urn:ietf:params:oauth:grant-type:device_code，按需要开启 refresh_token；无回调地址要求。
2. 如提供本地 PKCE 登录：启用 authorization_code、强制 S256，精确登记实际回调（程序默认 http://127.0.0.1:3210/callback）。公共客户端不嵌入 client_secret。
3. scopes：ccdb.factor.search、ccdb.factor.read、offline_access。资源绑定对应环境 Gateway 的 /management/api/ccdb/v1，不是 /mcp/ccdb。
4. 测试 Gateway 为 https://gateway-base-test.carbonstop.com，Agent 为 https://agenttest.carbonstop.com；其他环境以已部署的发现结果为准。
5. 远程 WorkBuddy 等连接器另按宿主 client_id、精确回调和 MCP resource 登记，不使用表中本地 MCP ID。
6. 迁移时不要立即停用 ccdb-connect-local；仍使用旧包的用户可保留原 ID。新包通过 CCDB_CLIENT_ID 显式使用后端已登记的其他 ID。旧 Token 不转移到新 ID。

请返回每个环境实际启用的 ID、grant、scope、resource、回调和测试结果；不要提供真实密钥或用户 Token。只有完成后端登记并发布包含映射的 CLI/MCP 后，用户才能直接使用这些默认值。
