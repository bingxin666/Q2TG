/**
 * 把 MTProto 的删除更新翻译成内部事件。
 *
 * 为什么不用 `instanceof`：这里刻意只依赖 `className` 做鸭子类型判断，
 * 这样这个模块就没有任何运行时 import，可以脱离 node_modules 单独跑测试。
 * （仓库里 `utils/peerId.ts` 也是用 `peer.className` 判断的，属于既有写法。）
 */
import type { Api } from 'telegram';
import type { TelegramDeletedMessagesEvent } from './TelegramDeletedMessages';

/** 把 BigInteger / number / string 统一成 number，避开大数精度问题 */
const toSafeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  const text = typeof value === 'object' && typeof (value as any).toString === 'function'
    ? (value as any).toString()
    : String(value);
  if (!/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/** 过滤掉非正整数、去重 */
const normalizeMessageIds = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<number>();
  for (const item of raw) {
    const id = toSafeNumber(item);
    if (id !== null && id > 0) ids.add(id);
  }
  return [...ids];
};

/**
 * @returns 解析成功返回事件；不是删除更新、或字段不合法时返回 null
 *
 * - `UpdateDeleteChannelMessages`：超级群/频道，**带 channelId**，能直接定位转发对
 * - `UpdateDeleteMessages`：普通群/私聊，**协议里就没有 chat id**（GramJS 源码注释也写明了
 *   私聊和小群的删除更新不告诉你在哪个会话），所以 chatId 返回 null，
 *   由上层按数据库里记录的 tgMsgId 反查
 */
export const parseTelegramDeleteUpdate = (
  update: Api.TypeUpdate | undefined | null,
): TelegramDeletedMessagesEvent | null => {
  if (!update) return null;

  const className = (update as { className?: string }).className;

  let chatId: number | null = null;
  let rawMessages: unknown;

  if (className === 'UpdateDeleteChannelMessages') {
    const rawChannelId = (update as unknown as { channelId?: unknown }).channelId;
    chatId = toSafeNumber(rawChannelId);
    // 频道更新拿不到 channelId 就没法定位，直接丢弃，免得误撤回别的会话
    if (chatId === null || chatId <= 0) return null;
    rawMessages = (update as unknown as { messages?: unknown }).messages;
  }
  else if (className === 'UpdateDeleteMessages') {
    rawMessages = (update as unknown as { messages?: unknown }).messages;
  }
  else {
    return null;
  }

  const messageIds = normalizeMessageIds(rawMessages);
  if (!messageIds.length) return null;

  return {
    chatId,
    messageIds,
    // MTProto 的删除更新本身就代表「永久删除」，没有 from_cache 的概念
    isPermanent: true,
    fromCache: false,
  };
};
