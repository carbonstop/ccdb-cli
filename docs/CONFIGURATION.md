# Configuration and authentication

## 环境和认证存储

| 配置                            | 用途                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `CCDB_PROFILE` / `--profile`    | local / test / pre / production 或自定义，默认 production                                  |
| `CCDB_API_BASE`                 | 网关根地址，不含 `/management`                                                      |
| `CCDB_OAUTH_ISSUER`             | 授权服务器标识，默认网关加 `/auth`                                                  |
| `CCDB_RESOURCE`                 | 默认 REST 资源 URI；客户端 REST 调用必须获得该资源 Token                            |
| `CCDB_AGENT_WEB`                | Carbon Agent 前端根地址                                                             |
| `CCDB_CLIENT_ID`                | 已登记 OAuth 应用标识，默认 ccdb-connect-local                                      |
| `CCDB_REDIRECT_URI`             | PKCE 精确回调，默认 http://127.0.0.1:3210/callback                                  |
| `CCDB_API_KEY`                  | 可选完整 Key，优先于保存的 OAuth/Key                                                |
| `CCDB_CONFIG_DIR`               | 独立认证目录；profile/issuer/client/resource 共同隔离凭证                           |
| `CCDB_AUTH_STORE`               | 默认系统存储；file 显式启用 AES-GCM 加密文件后备，并记住该身份的选择 |
| `CCDB_TIMEOUT_MS` / `--timeout` | 单请求超时，默认 30000，范围 100–120000 毫秒                                        |

local 默认网关 `http://127.0.0.1:8880`、前端 `http://127.0.0.1:3100`。实际端口不同时须同步配置，不要把 localhost 与 127.0.0.1 混为精确匹配相同值。

test 默认网关为 https://gateway-base-test.carbonstop.com，前端为 https://agenttest.carbonstop.com；不再要求额外设置 CCDB_API_BASE。已有显式环境变量仍优先，client_id 仍必须在目标环境登记。

包含 ccdb-client 0.1.1 的新版本中，显式 CCDB_AUTH_STORE=file 使用 AES-256-GCM 密文和 0600 本地主密钥文件；同身份后续查询、刷新无需重复设置变量。主密钥和密文都在本机，保护弱于系统钥匙串。旧 file 格式可读，下次写入升级；旧版程序不支持新密文格式，不要混用版本。非本机公开接口必须 HTTPS，不要提交认证目录。系统存储故障不会静默降级。登录会在授权前预检存储。

上述行为需要先发布 SDK 0.1.1，再构建并发布本包；仅更新 GitHub 文档不会更新已安装程序。主密钥丢失/损坏会明确报错，不覆盖原凭证。完整边界见共享 SDK 的 docs/CREDENTIAL_STORAGE.md。

刷新串行加锁并写入持久化进行标记。网络结果不明确或无法保存新 Refresh Token 时，拒绝重放旧 Refresh Token 并要求重新登录，避免触发服务端复用检测。业务 401 最多刷新并重试一次；403/429 不自动换凭证或重试刷额度。

## 错误和退出码

`--json` 普通命令输出单个 JSON；登录过程为 JSON 行，均不输出 Token/完整 Key。错误包含 code/message 和可用的 HTTP 状态、requestId、retryAfterSeconds。

| 退出码 | 含义                 |
| ------ | -------------------- |
| 0      | 成功                 |
| 2      | 参数或配置无效       |
| 3      | 需登录/凭证失效      |
| 4      | 权限不足             |
| 5      | 限流或额度耗尽       |
| 6      | 网络、上游或其他失败 |
| 7      | 因子不存在           |
| 130    | 用户取消             |
