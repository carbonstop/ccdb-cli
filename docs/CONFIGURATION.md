# Configuration and authentication

## 环境和认证存储

| 配置                            | 用途                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `CCDB_PROFILE` / `--profile`    | local / pre / production 或自定义，默认 production                                  |
| `CCDB_API_BASE`                 | 网关根地址，不含 `/management`                                                      |
| `CCDB_OAUTH_ISSUER`             | 授权服务器标识，默认网关加 `/auth`                                                  |
| `CCDB_RESOURCE`                 | 默认 REST 资源 URI；客户端 REST 调用必须获得该资源 Token                            |
| `CCDB_AGENT_WEB`                | Carbon Agent 前端根地址                                                             |
| `CCDB_CLIENT_ID`                | 已登记 OAuth 应用标识，默认 ccdb-connect-local                                      |
| `CCDB_REDIRECT_URI`             | PKCE 精确回调，默认 http://127.0.0.1:3210/callback                                  |
| `CCDB_API_KEY`                  | 可选完整 Key，优先于保存的 OAuth/Key                                                |
| `CCDB_CONFIG_DIR`               | 独立认证目录；profile/issuer/client/resource 共同隔离凭证                           |
| `CCDB_AUTH_STORE`               | 默认 auto：Windows DPAPI、macOS Keychain、Linux Secret Service；file 为显式明文回退 |
| `CCDB_TIMEOUT_MS` / `--timeout` | 单请求超时，默认 30000，范围 100–120000 毫秒                                        |

local 默认网关 `http://127.0.0.1:8880`、前端 `http://127.0.0.1:3100`。实际端口不同时须同步配置，不要把 localhost 与 127.0.0.1 混为精确匹配相同值。

非本机公开接口必须 HTTPS。不要提交认证目录。`file` 存储是明文回退，不是加密；需要自行保护目录权限。Windows auto 已做 DPAPI 实测，macOS/Linux 的系统密钥库仍需对应平台验证。

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
