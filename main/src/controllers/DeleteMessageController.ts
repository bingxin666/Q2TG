import DeleteMessageService from '../services/DeleteMessageService';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import Instance from '../models/Instance';
import { MessageRecallEvent, QQClient } from '../client/QQClient';
import { TelegramDeletedMessagesEvent } from '../client/TelegramDeletedMessages';

export default class DeleteMessageController {
  private readonly deleteMessageService: DeleteMessageService;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: QQClient) {
    this.deleteMessageService = new DeleteMessageService(this.instance, tgBot);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramEditMessage);
    tgBot.addDeletedMessagesEventHandler(this.onTelegramDeletedMessages);
    oicq.addMessageRecallEventHandler(this.onQqRecall);
    this.deleteMessageService.startTelegramDeleteFallbackPolling();
  }

  private onTelegramMessage = async (message: Api.Message) => {
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return false;
    if (message.message?.split('@')?.[0] === '/rm') {
      // 撤回消息
      await this.deleteMessageService.handleTelegramMessageRm(message, pair);
      return true;
    }
  };

  private onTelegramEditMessage = async (message: Api.Message) => {
    if (message.senderId?.eq(this.instance.botMe.id)) return true;
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return;
    if (await this.deleteMessageService.isInvalidEdit(message, pair)) {
      return true;
    }
    await this.deleteMessageService.telegramDeleteMessage(message.id, pair);
    return await this.onTelegramMessage(message);
  };

  private onTelegramDeletedMessages = async (event: TelegramDeletedMessagesEvent) => {
    await this.deleteMessageService.handleTelegramDeletedMessages(event);
  };

  private onQqRecall = async (event: MessageRecallEvent) => {
    const pair = this.instance.forwardPairs.find(event.chat);
    if (!pair) return;
    await this.deleteMessageService.handleQqRecall(event, pair);
  };
}
