# ecoinvent 数值受限引导

2026-09-07：新增可选字段，不改变因子原值、ID、详情链接及鉴权方式。

搜索仅在本次实际返回 ecoinvent 候选时，增加一个顶层 `guidance`；不会每条候选重复增加提示。`actionUrl` 指向首个 ecoinvent 结果的 `detailUrl`，其余因子继续使用自己的 `detailUrl`。普通结果或空结果没有该字段。

详情与匿名落地页在 `data.guidance` 返回相同结构，链接指向当前因子。新分享快照保留详情中的引导；历史快照不改写。

```json
{
  "guidance": {
    "code": "ECOINVENT_VALUE_RESTRICTED",
    "message": "ecoinvent 因子在当前接口中不提供明文数值。请前往 Carbon Agent 查看来源与适用范围，并继续咨询因子匹配和核算问题。",
    "actionLabel": "前往 Carbon Agent 查看因子详情",
    "actionUrl": "http://127.0.0.1:3100/factors/2252434199368960"
  }
}
```

以上是结构示例，URL 使用当前环境配置，不是固定域名。`language=en` 返回英文说明和操作文案；原因码和目标链接不变。

- MCP 的 `structuredContent` 和文本 JSON、CLI `--json` 原样保留该字段。
- CLI 普通输出在候选列表/详情末尾显示一份说明及链接。
- MCP instructions 和 Skill 要求 Agent 在一次回答中统一提示一次，各因子名称保留自己的链接。
- 不承诺登录/注册后解锁明文；不自动推荐替代因子，不把掩码用于计算。
- 用户明确要求替代方案时，再核对对象、单位与边界继续匹配。
- 不将 null、缺失值或其他来源的掩码推断为 ecoinvent 许可限制。
- 该字段是成功响应中的说明，不是 HTTP 403 或工具执行错误。旧服务未返回该字段时仍兼容。

本地安装产物已重新构建；服务端需加载新的 Management 代码，运行中的 MCP 需加载新的构建产物。无需 SQL、OAuth 重新授权或 Gateway 修改。
