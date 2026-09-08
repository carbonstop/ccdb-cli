# Configuration and authentication

## 环境和认证存储

| 配置                            | 用途                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `CCDB_PROFILE` / `--profile`    | local / test / pre / production 或自定义，默认 production                                  |
| `CCDB_API_BASE`                 | 网关根地址，不含 `/management`                                                      |
| `CCDB_OAUTH_ISSUER`             | 授权服务器标识，默认网关加 `/auth`                                                  |
| `CCDB_RESOURCE`                 | 默认 REST 资源 URI；客户端 REST 调用必须获得该资源 Token                            |
| `CCDB_AGENT_WEB`                | Carbon Agent 前端根地址                                                             |
| `CCDB_CLIENT_ID`                | 可显式覆盖；默认按应用和环境映射，见下表 |

| `CCDB_REDIRECT_URI`             | PKCE 精确回调，默认 http://127.0.0.1:3210/callback                                  |
| `CCDB_API_KEY`                  | 可选完整 Key，优先于保存的 OAuth/Key                                                |
| `CCDB_CONFIG_DIR`               | 独立认证目录；profile/issuer/client/resource 共同隔离凭证                           |
| `CCDB_AUTH_STORE`               | 系统存储优先；新身份在服务不可用时自动使用加密文件并提示，file 可显式选择 |
| `CCDB_TIMEOUT_MS` / `--timeout` | 单请求超时，默认 30000，范围 100–120000 毫秒                                        |

local 默认网关 `http://127.0.0.1:8880`、前端 `http://127.0.0.1:3100`。实际端口不同时须同步配置，不要把 localhost 与 127.0.0.1 混为精确匹配相同值。

test 默认网关为 https://gateway-base-test.carbonstop.com，前端为 https://agenttest.carbonstop.com；不再要求额外设置 CCDB_API_BASE。已有显式环境变量仍优先，client_id 仍必须在目标环境登记。

首次登录的新身份在系统凭证服务不可用时自动使用 AES-256-GCM 文件后备，并显示提示、记住选择；不需要用户设置 CCDB_AUTH_STORE。已有系统凭证不可读、文件损坏、主密钥丢失或文件权限错误时不会自动覆盖。主密钥与密文均在本机，保护弱于系统密钥服务。

默认目录为 ~/.config/carbonstop/ccdb/（遵循 XDG_CONFIG_HOME 或 LOCALAPPDATA）。默认配置下，旧 Carbonstop/CCDB-Connect 目录已有身份继续使用原文件和锁，新身份使用新目录；不搬迁或复制 Token。两处同时存在同一身份会报冲突。显式 CCDB_CONFIG_DIR 不搜索其他目录。旧版本无法读取新目录，不应并发创建相同新身份。

刷新串行加锁并写入持久化进行标记。网络结果不明确或无法保存新 Refresh Token 时，拒绝重放旧 Refresh Token 并要求重新登录，避免触发服务端复用检测。业务 401 最多刷新并重试一次；403/429 不自动换凭证或重试刷额度。

## OAuth 客户端默认映射

| profile | 本应用默认 client_id |
| --- | --- |
| local | ccdb-cli-local |
| test | ccdb-cli-test |
| pre | ccdb-cli-pre |
| production（默认） | ccdb-cli-prod |

上述 ID 是待后端登记的应用标识，不代表已注册或已启用。CLI 和本地 stdio MCP 各自使用自己的 ID；同应用同环境用户共用 ID，各自持有 Token。profile 不会自动注册客户端，环境隔离还依赖 issuer/resource 和后端配置。自定义 profile 须显式配置 CCDB_CLIENT_ID 和环境地址。

显式 CCDB_CLIENT_ID 优先于表中默认值。后端尚未登记新 ID 时，可继续设置 CCDB_CLIENT_ID=ccdb-connect-local（前提是旧 ID 已启用）。默认 ID 改变后需重新登录，不迁移或复用旧 ID 的 Token；登录与实际调用必须保持相同 profile、client_id 和配置目录。

设备码登录无需回调白名单，但后端必须开启 device grant、所需 scopes 及 REST resource；PKCE 需精确登记回调。远程 HTTP 的 OAuth 客户端是 WorkBuddy 等宿主，不使用此表的本地登录 ID，Gateway-first 的认证配置不变。

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
