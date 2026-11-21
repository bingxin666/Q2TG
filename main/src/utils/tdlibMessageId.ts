const TDLIB_MESSAGE_ID_SHIFT = 20n;

export const tdlibMessageIdToBotApi = (messageId: number | string | bigint) => {
  const id = BigInt(messageId);
  const result = id >> TDLIB_MESSAGE_ID_SHIFT;
  if ((result << TDLIB_MESSAGE_ID_SHIFT) !== id) return 0;
  return Number(result);
};

export const botApiMessageIdToTdlib = (messageId: number) =>
  (BigInt(messageId) << TDLIB_MESSAGE_ID_SHIFT).toString();

const SUPERGROUP_ID_OFFSET = 1000000000000n;

/**
 * TDLib 的 chat_id 转成 GramJS / `Pair.tgId` 那套 id。
 *
 * 两边的表示不一样，不统一的话 `forwardPairs.find()` 永远匹配不上，
 * 删除事件会被当作「未匹配到转发 Pair」静默丢掉：
 * - 超级群/频道：TDLib 是 `-100xxxxxxxxxx`，GramJS 的 `Api.Channel.id` 是裸 `xxxxxxxxxx`
 * - 普通群：TDLib 是 `-chatId`，GramJS 的 `Api.Chat.id` 是正数 `chatId`
 */
export const tdlibChatIdToBotApi = (chatId: number | string | bigint): number | null => {
  const id = BigInt(chatId);
  if (id >= 0n) {
    return Number.isSafeInteger(Number(id)) ? Number(id) : null;
  }
  const abs = -id;
  const result = abs > SUPERGROUP_ID_OFFSET ? abs - SUPERGROUP_ID_OFFSET : abs;
  const value = Number(result);
  return Number.isSafeInteger(value) ? value : null;
};
