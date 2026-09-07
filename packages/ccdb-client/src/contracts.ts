import { z } from 'zod';

/** IDs are opaque decimal strings. BigInt is used only for validation. */
export const factorIdSchema = z
  .string()
  .regex(/^[0-9]{1,19}$/)
  .refine(
    (v) => /^[0-9]{1,19}$/.test(v) && BigInt(v) <= 9223372036854775807n,
    'factorId 超出有效范围',
  )
  .describe('搜索返回的因子 ID，数字字符串；禁止转为 Number，例如 2232515359983616');
export const languageSchema = z
  .enum(['zh', 'en'])
  .default('zh')
  .describe('响应语言：zh 中文，en 英文，默认 zh');
export const searchSchema = z
  .object({
    query: z
      .string()
      .transform((v) => v.trim().replace(/\s+/gu, ' '))
      .refine((v) => [...v].length >= 2 && [...v].length <= 200, 'query 需要 2～200 个字符')
      .refine((v) => !/[*%_]/u.test(v) && !/^(all|全部|所有)$/iu.test(v), '不支持全库或通配查询')
      .describe('具体材料或活动关键词，规范化后 2～200 字符，例如 电力；不支持通配或全库检索'),
    language: languageSchema,
    accountingType: z
      .enum(['product', 'enterprise'])
      .default('product')
      .describe('核算口径：product 产品，enterprise 企业'),
    filters: z
      .object({
        country: z
          .array(z.string().min(1))
          .max(20)
          .optional()
          .describe('地区筛选，最多 20 项；例如 [中国]，不指定则不添加地区限制'),
        year: z
          .array(z.number().int())
          .max(20)
          .optional()
          .describe('后端 year 字段筛选，最多 20 项；不等同于规格中的适用年度'),
        sourceLevel: z
          .array(z.string().min(1))
          .max(20)
          .optional()
          .describe('来源类别筛选，最多 20 项，例如 [国家排放因子]'),
      })
      .strict()
      .optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('最多返回的候选数，1～10，默认 5；不是全部命中总数'),
  })
  .strict();
export const detailInputSchema = z
  .object({ factorId: factorIdSchema, language: languageSchema })
  .strict();
const localized = z.union([z.string(), z.record(z.string(), z.unknown()), z.null()]);
const scalar = z.union([z.number(), z.string(), z.null()]);
export const factorGuidanceSchema = z
  .object({
    code: z.literal('ECOINVENT_VALUE_RESTRICTED'),
    message: z.string(),
    actionLabel: z.string(),
    actionUrl: z.url(),
  })
  .passthrough();
export const itemSchema = z
  .object({
    factorId: factorIdSchema,
    name: localized,
    value: scalar,
    numeratorUnit: z.string().nullable().optional(),
    denominatorUnit: z.string().nullable().optional(),
    specification: localized.optional(),
    country: localized.optional(),
    year: scalar.optional(),
    sourceName: localized.optional(),
    verified: z.boolean().optional(),
    detailUrl: z.url(),
  })
  .passthrough();
export const searchResponseSchema = z
  .object({
    requestId: z.string(),
    items: z.array(itemSchema),
    limit: z.number().int(),
    guidance: factorGuidanceSchema.optional(),
  })
  .passthrough();
export const detailResponseSchema = z
  .object({
    code: z.number(),
    msg: z.string(),
    requestId: z.string(),
    data: z
      .object({
        factorId: factorIdSchema,
        id: factorIdSchema.optional(),
        detailUrl: z.url(),
        guidance: factorGuidanceSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type SearchRequest = z.input<typeof searchSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type DetailResponse = z.infer<typeof detailResponseSchema>;
export interface FactorClient {
  search(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  detail(factorId: string, language?: 'zh' | 'en', signal?: AbortSignal): Promise<DetailResponse>;
}
