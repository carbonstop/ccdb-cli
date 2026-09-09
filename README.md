# CCDB CLI

在终端或 AI Agent 中查询 Carbonstop 碳阻迹 CCDB 排放因子，按地区、年份等条件搜索候选，并查看因子详情、单位、系统边界与来源。

查询结果包含接口返回的因子详情链接，可在 [Carbon Agent](https://agent.carbonstop.com) 查看对应数据与适用信息。可见范围取决于账号权限和数据许可，登录不代表所有数值均可解锁。

## 快速开始

### 1. 安装

**使用 npm（需要 Node.js 22+）：**

```sh
npm install -g ccdb-cli@latest
ccdb-cli --version
```

**不安装 Node.js：** 从 [最新 Release](https://github.com/carbonstop/ccdb-cli/releases/latest) 下载对应系统和架构的独立二进制，核对 `SHA256SUMS.txt` 后解压。macOS/Linux 使用 `ccdb-cli`，Windows 使用 `ccdb-cli.exe`；将可执行文件所在目录加入 PATH 后再运行 `ccdb-cli --version`。macOS/Linux 如缺少执行权限，可在解压目录执行 `chmod +x ccdb-cli`。

独立二进制覆盖 macOS arm64/x64、Linux glibc arm64/x64 和 Windows x64。下载包可能触发系统信任提示，请核对来源并按系统提示处理，不要全局关闭安全保护。

### 2. 登录授权

首次使用时执行：

```sh
ccdb-cli auth login
```

默认使用 device OAuth。按终端提示在浏览器完成登录与授权；已有有效凭证时无需重复登录。无浏览器终端可加 `--no-browser`，在另一设备打开显示的链接。查询命令不会自动启动登录。

### 3. 搜索与查看详情

下面的示例搜索中国电力因子；请按实际场景调整关键词和条件：

```sh
ccdb-cli factor search "电力" --country "中国" --limit 5 --json
```

需要详情时，将占位符替换为搜索返回的真实字符串 `factorId`，再单独执行：

```sh
ccdb-cli factor detail "<搜索返回的factorId>" --json
```

`factorId` 不要转为数字。JSON 中的 `detailUrl` 是对应因子的查看入口；链接缺失时不要自行拼接。推荐或选用因子前，应核对单位、地区、年份、系统边界和来源。受限值 `******` 与缺失值不是 0，不能用于计算；候选结果也不等于最终推荐。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `ccdb-cli --help` | 查看命令和参数 |
| `ccdb-cli auth status --json` | 检查本地凭证状态 |
| `ccdb-cli doctor --json` | 检查配置和发现端点，不查询因子 |
| `ccdb-cli factor search "<关键词>" --limit 5 --json` | 搜索因子 |
| `ccdb-cli factor detail "<factorId>" --json` | 查询详情，ID 来自搜索结果 |
| `ccdb-cli auth logout` | 清理当前身份的本地凭证 |

`--json` 便于脚本和 Agent 读取。更多筛选条件与数据使用规则见 [因子查询指南](https://github.com/carbonstop/ccdb-cli/blob/main/docs/FACTOR_GUIDANCE.md)。

## 认证与环境

默认连接 `production`。只有使用测试环境时，才为登录、状态检查和查询统一指定 `--profile test`：

```sh
ccdb-cli auth login --profile test
ccdb-cli auth status --profile test --json
ccdb-cli factor search "电力" --profile test --limit 5 --json
```

详情查询也必须使用同一个 profile。显式环境变量仍可覆盖预设地址和客户端 ID，详见 [配置说明](https://github.com/carbonstop/ccdb-cli/blob/main/docs/CONFIGURATION.md)。不要因连接失败自动切换环境。

API Key 是主动选择的备选：使用 `ccdb-cli auth login --method api-key` 的不回显输入，或在实际执行环境中安全配置 `CCDB_API_KEY`。不要在聊天、命令参数、仓库或日志中提供完整 Key。

显式 `CCDB_API_KEY` 优先于已保存凭证；OAuth 失败不自动切换 Key，Key 失败也不自动切换 OAuth。恢复 OAuth 时需移除实际执行环境中的 Key 配置。PKCE 可通过 `--method pkce` 显式选择。

默认 logout 不会停用服务端 API Key 或删除环境变量。`ccdb-cli auth logout --revoke` 会撤销整条应用授权，可能影响共用该授权的其他工具，确认影响后再执行。

## 常见问题

- **安装成功但查询失败：** `--version` 仅证明程序可执行；`auth status` 仅检查本地凭证；`doctor` 检查发现端点。业务权限需通过实际查询确认。按用户需要做一次小范围查询即可，不为安装验收批量消耗配额。
- **返回空结果或受限值：** 不一定是认证失败，可能与检索条件、数据覆盖或权限有关。不要通过旧接口反查受限值。
- **`invalid_client`：** 请管理员核对目标环境的客户端登记与启用状态，以及是否有环境变量覆盖配置；profile 不会自动注册客户端。
- **凭证存储后备提示：** 新身份在系统凭证服务不可用时会自动使用本地加密文件并记住选择，提示本身不代表登录失败。主密钥也在本机，保护弱于系统钥匙串；已有凭证损坏或主密钥丢失时不会自动覆盖。不要删除凭证文件来强制重置，存储路径与兼容规则见 [配置说明](https://github.com/carbonstop/ccdb-cli/blob/main/docs/CONFIGURATION.md)。
- **401 / 403 / 429：** 分别检查登录、访问权限和限流提示，不切换身份或旧接口绕过限制。排错可提供错误码和 requestId，不提供 Key 或 Token。
- **更新后仍显示旧版本：** 检查 PATH 是否选中了另一份安装。npm 用户使用下面的更新命令；二进制用户从官方 Release 下载并替换所用版本。

## 更新与更多文档

npm 安装可执行以下命令更新：

```sh
npm install -g ccdb-cli@latest
```

镜像未同步时追加 `--registry=https://registry.npmjs.org/`。跨越不兼容版本前阅读 [迁移说明](https://github.com/carbonstop/ccdb-cli/blob/main/docs/MIGRATION.md)。

- [Carbon Agent：查看因子详情](https://agent.carbonstop.com)
- [环境与认证配置](https://github.com/carbonstop/ccdb-cli/blob/main/docs/CONFIGURATION.md)
- [因子查询指南](https://github.com/carbonstop/ccdb-cli/blob/main/docs/FACTOR_GUIDANCE.md)
- 维护者：[开发指南](https://github.com/carbonstop/ccdb-cli/blob/main/docs/DEVELOPMENT.md) · [构建与发布](https://github.com/carbonstop/ccdb-cli/blob/main/docs/DISTRIBUTION.md)
