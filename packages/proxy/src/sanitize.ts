/**
 * 用户提示词提交前过滤：类型、长度、控制字符。
 * 返回 null 表示非法输入；通过过滤的提示词仍会经 OutputValidator 最终兜底。
 */
export function sanitizeUserPrompt(raw: unknown, maxLength = 500): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ") // C0 与 DEL 替换为空格
    .replace(/[\u0080-\u009F]/g, "") // C1 控制字符整段删除
    .trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) return null;
  return cleaned;
}
