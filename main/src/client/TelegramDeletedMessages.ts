export interface TelegramDeletedMessagesEvent {
  chatId: number;
  messageIds: number[];
  isPermanent: boolean;
  fromCache: boolean;
}
