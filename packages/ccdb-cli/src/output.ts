/** Localized fields remain untouched in JSON; only the terminal view selects a label. */
export function label(value: unknown, language = 'zh'): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'object') return String(value);
  if (!Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of [language, language === 'zh' ? 'cn' : 'en', 'name', 'label', 'value'])
      if (typeof object[key] === 'string') return object[key];
  }
  return JSON.stringify(value);
}
export function humanOutput(result: unknown, language = 'zh'): string {
  const obj = result as Record<string, any>;
  if (Array.isArray(obj.items)) {
    if (!obj.items.length) return `未找到候选因子。请求 ID：${obj.requestId}`;
    return (
      obj.items
        .map(
          (item: any, index: number) =>
            `${index + 1}. ${label(item.name, language)}\n   ID: ${item.factorId}\n   ${label(
              item.value,
            )} ${label(item.numeratorUnit)}/${label(item.denominatorUnit)}\n   ${label(
              item.country,
              language,
            )} · ${label(item.year)} · ${label(item.sourceName, language)}\n   ${item.detailUrl}`,
        )
        .join('\n\n') +
      `\n\n以上为候选，不代表最终推荐。请求 ID：${obj.requestId}` +
      guidanceOutput(obj.guidance)
    );
  }
  if (obj.data?.factorId) {
    const d = obj.data;
    return (
      `${label(d.name, language)}\nID: ${d.factorId}\n因子值: ${label(d.cValue)} ${label(
        d.unit,
      )}\n规格: ${label(d.specification, language)}\n适用场景: ${label(
        d.description,
        language,
      )}\n来源: ${label(d.institution, language)} · ${label(d.year)}\n详情: ${
        d.detailUrl
      }\n请求 ID: ${obj.requestId}` + guidanceOutput(d.guidance)
    );
  }
  return JSON.stringify(result, null, 2);
}

function guidanceOutput(guidance: any): string {
  if (guidance?.code !== 'ECOINVENT_VALUE_RESTRICTED') return '';
  return `\n\n${guidance.message}\n${guidance.actionLabel}: ${guidance.actionUrl}`;
}
