# CCDB CLI

命令：`ccdb-cli`；npm 包：`ccdb-cli`。另提供无需 Node.js 的独立二进制，构建、下载与发布见 [分发说明](docs/DISTRIBUTION.md)。

独立的 CCDB 因子查询命令行。npm 版需要 Node.js 22+；独立二进制无需 Node.js。内含接口与认证代码，不需要安装 MCP 或 ccdb-client。

## 从 npm 安装（推荐）

从 [npm](https://www.npmjs.com/package/ccdb-cli) 安装：

```sh
npm install -g ccdb-cli@latest
ccdb-cli --version
ccdb-cli auth login --method device
ccdb-cli factor search "电力" --country "中国" --limit 5 --json
ccdb-cli doctor --json
ccdb-cli --help
```

安装或升级均使用上述命令，获取 npm latest。若国内镜像尚未同步，可追加 `--registry=https://registry.npmjs.org/`。安装成功不等于取得数据库权限，查询仍需服务端可用并完成授权。

详情查询需使用搜索响应中的真实字符串 factorId，不要复制固定示例 ID。先替换占位符再执行：

```sh
ccdb-cli factor detail "<搜索返回的factorId>" --json
```

### 测试环境

以下命令均使用同一个 test profile；不要测试环境登录后再省略 profile 去查询生产环境：

```sh
ccdb-cli auth login --profile test
ccdb-cli auth status --profile test --json
ccdb-cli factor search "电力" --profile test --limit 5 --json
```

取得搜索结果后，用返回的字符串 ID 替换下方占位符，再单独执行：

```sh
ccdb-cli factor detail "<搜索返回的factorId>" --profile test --json
```

### 如何确认接入成功

`--version` 成功仅表示程序可执行；`auth status` 仅表示本地凭证状态；`doctor` 只检查发现端点。用户需要查询时，一次小范围搜索返回正常业务响应才表示查询链路可用；详情使用真实搜索 ID 验证。空结果不一定是接入失败，受限值也不代表认证失败。不要为了安装验收额外批量查询或消耗配额。

### 认证选择：默认 device OAuth，API Key 为备选

`ccdb-cli auth login` 默认使用 device OAuth，等价于 `ccdb-cli auth login --method device`。终端给出授权链接和设备码，由用户在浏览器登录并授权；无浏览器终端可加 `--no-browser`。查询本身不会自动启动登录。

API Key 是用户主动选择的备选：由宿主 Secret 设置 `CCDB_API_KEY`，或使用 `ccdb-cli auth login --method api-key` 不回显输入。不要在命令参数、聊天或日志中粘贴完整 Key。

默认推荐顺序不改变显式配置：环境 `CCDB_API_KEY` 存在时仍优先于已保存凭证；恢复 OAuth 前应从实际执行环境中移除该变量并登录。没有环境 Key 时使用已保存凭证。OAuth 无法刷新时提示重新登录，不自动切换 Key；Key 失败也不自动切换 OAuth。PKCE 是通过 `--method pkce` 显式选择的另一种 OAuth 登录方式。

默认环境为 `production`。环境与 OAuth 客户端配置见 [配置说明](docs/CONFIGURATION.md)。

Windows 自动凭证存储使用 DPAPI；macOS/Linux 依赖本机 Keychain/Secret Service。首次登录的新身份遇到系统凭证服务不可用时，会自动使用加密文件、显示提示并记住选择，无需设置环境变量。已有凭证损坏或主密钥缺失时不会覆盖。主密钥也保存在本机，保护强度不等同于系统密钥服务，需限制本机文件访问权限。

`ccdb-cli auth logout --revoke` 撤销整条应用授权，可能影响共享凭证的其他工具。默认 logout 只清理本地，不停用 API Key，也不移除环境变量。

数值受限 `******` 不可计算。候选不是最终推荐，须结合详情、单位、范围判断。

See [configuration](docs/CONFIGURATION.md), [migration](docs/MIGRATION.md), and [factor guidance](docs/FACTOR_GUIDANCE.md).

## 开发

```sh
npm ci
npm run verify
```

源码包安装和本地调试见 [开发指南](docs/DEVELOPMENT.md)。

默认凭证目录为 `~/.config/carbonstop/ccdb/`（支持系统配置根目录覆盖）。旧目录已有的身份继续沿用原文件和锁，不复制 Token；新身份写入新目录。`CCDB_CONFIG_DIR` 可显式指定独立目录。
