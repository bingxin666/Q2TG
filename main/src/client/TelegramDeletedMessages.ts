export interface TelegramDeletedMessagesEvent {
  /**
   * 与 `Pair.tgId` 对齐的 chat id（超级群是裸 channelId，不带 -100 前缀）。
   *
   * 为 `null` 表示这条更新本身没带 chat 信息 —— MTProto 的 `updateDeleteMessages`
   * 用于普通群/私聊时协议里就只有 message id，不告诉你在哪个会话，
   * 需要上层按数据库里记录的 `tgMsgId` 反查所属转发对。
   */
  chatId: number | null;
  messageIds: number[];
  isPermanent: boolean;
  fromCache: boolean;
}
