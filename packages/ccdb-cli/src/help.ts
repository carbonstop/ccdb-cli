const common = `通用选项
  --profile <环境>       默认 production，可选 local / test / pre / 自定义
  --json                 机器可读输出；登录进度为 JSON 行
  --timeout <毫秒>       单次请求超时
  -h, --help             查看帮助
  --version              查看版本
`;

export function helpText(parts: string[]): string {
  const topic = parts.slice(0, 2).join(' ');
  const pages: Record<string, string> = {
    'auth login': `登录 CCDB

用法
  ccdb-cli auth login [选项]

登录选项
  --method <方式>        device（默认）/ pkce / api-key
  --no-browser           不自动打开浏览器，手动访问授权链接

示例
  ccdb-cli auth login --profile test

设备码和授权链接会显示在终端，由你在浏览器完成授权。
API Key 通过隐藏输入或 stdin 提供，不要放进命令参数。
环境 CCDB_API_KEY 优先于保存的凭证；OAuth 失败不会自动改用 Key。
`,
    'auth status': `查看本地凭证状态

  ccdb-cli auth status [--profile <环境>] [--json]

状态不代表远程权限有效；不会输出 Token 或完整 API Key。
`,
    'auth logout': `退出登录

  ccdb-cli auth logout [--profile <环境>] [--revoke]

默认只清理本地凭证。
--revoke 撤销整条应用授权，可能影响共用授权的其他工具。
不会删除环境 CCDB_API_KEY，也不会在服务端停用 API Key。
`,
    'factor search': `搜索排放因子

用法
  ccdb-cli factor search <关键词> [选项]

查询选项
  --country <地区>       地区筛选，可重复
  --year <年份>          年份筛选，可重复
  --source-level <来源>  来源级别筛选，可重复
  --limit <数量>         返回 1～10 条，默认 5
  --language <语言>      zh / en
  --accounting-type <类> product / enterprise

示例
  ccdb-cli factor search "电力" --profile test --limit 5

返回的是候选因子；推荐前请核对详情、单位及适用范围。
`,
    'factor detail': `查看因子详情

  ccdb-cli factor detail <factorId> [--language zh|en] [选项]

factorId 必须原样使用搜索结果中的字符串 ID，不使用示例 ID。
详情与搜索须保持相同 profile；受限值不是 0，不能用于计算。
`,
    doctor: `检查服务配置

  ccdb-cli doctor [--profile <环境>] [--json]

检查发现端点和本地凭证状态，不查询因子、不消耗查询配额。
诊断通过不代表业务权限有效。
`,
  };
  if (pages[topic]) return pages[topic] + '\n' + common;
  return `ccdb-cli — CCDB 排放因子查询

用法
  ccdb-cli <命令> [选项]

账号
  auth login             登录（默认设备码授权）
  auth status            查看本地凭证状态
  auth logout            退出登录

因子
  factor search <关键词> 搜索候选因子
  factor detail <ID>     查看因子详情

诊断
  doctor                 检查服务配置

快速开始（测试环境）
  ccdb-cli auth login --profile test
  ccdb-cli factor search "电力" --profile test --limit 5

${common}
更多参数：ccdb-cli factor search --help
登录选项：ccdb-cli auth login --help
`;
}
