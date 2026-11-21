import { getLogger, Logger } from 'log4js';
import path from 'path';
import * as tdl from 'tdl';
import { getTdjson } from 'prebuilt-tdlib';
import env from '../models/env';
import { tdlibMessageIdToBotApi, tdlibChatIdToBotApi } from '../utils/tdlibMessageId';
import { TelegramDeletedMessagesEvent } from './TelegramDeletedMessages';

type TdUpdate = {
  _: string;
  id?: number | string;
  chat_id?: number;
  message_id?: number | string;
  message_ids?: Array<number | string>;
  message?: {
    id: number | string;
    chat_id: number;
  };
  payload?: {
    _: string;
    data?: string;
  };
  is_permanent?: boolean;
  from_cache?: boolean;
};

export default class TelegramTdlibUpdates {
  private readonly log: Logger;
  private client: ReturnType<typeof tdl.createClient>;
  private started = false;

  constructor(
    private readonly sessionId: number,
    private readonly botToken: string,
    private readonly onNewMessage: (chatId: number, messageId: number) => Promise<void>,
    private readonly onEditedMessage: (chatId: number, messageId: number) => Promise<void>,
    private readonly onDeletedMessages: (event: TelegramDeletedMessagesEvent) => Promise<void>,
    private readonly onCallbackQuery: (data: Buffer, answer: () => Promise<void>) => Promise<void>,
  ) {
    this.log = getLogger(`TelegramTdlibUpdates - ${sessionId}`);
  }

  public async start() {
    if (this.started) return;
    this.started = true;

    tdl.configure({
      tdjson: getTdjson(),
      verbosityLevel: env.TG_TDLIB_VERBOSITY,
    });

    const databaseDirectory = env.TG_TDLIB_DATABASE_DIR ||
      path.join(env.DATA_DIR, 'tdlib', String(this.sessionId), 'db');
    const filesDirectory = env.TG_TDLIB_FILES_DIR ||
      path.join(env.DATA_DIR, 'tdlib', String(this.sessionId), 'files');

    this.client = tdl.createClient({
      apiId: env.TG_API_ID,
      apiHash: env.TG_API_HASH,
      databaseDirectory,
      filesDirectory,
      useTestDc: env.TG_USE_TEST_DC,
      skipOldUpdates: env.TG_TDLIB_SKIP_OLD_UPDATES,
      tdlibParameters: {
        use_message_database: true,
        use_file_database: true,
        use_chat_info_database: true,
        use_secret_chats: false,
        system_language_code: 'zh',
        application_version: 'Q2TG',
        device_model: 'Q2TG TDLib Bot Updates',
      },
    });

    this.client.on('error', (error: unknown) => {
      this.log.error('TDLib error', error);
    });
    this.client.on('update', (update: TdUpdate) => {
      this.handleUpdate(update).catch(error => this.log.error('处理 TDLib update 失败', update, error));
    });

    await this.client.loginAsBot(this.botToken);
    this.log.info('TDLib Bot 入站已启动');
  }

  public async close() {
    if (!this.client) return;
    await this.client.close();
  }

  private async handleUpdate(update: TdUpdate) {
    switch (update._) {
      case 'updateNewMessage':
        await this.handleMessageUpdate(update, this.onNewMessage);
        break;
      case 'updateMessageEdited':
        await this.handleMessageUpdate(update, this.onEditedMessage);
        break;
      case 'updateDeleteMessages':
        await this.handleDeleteMessages(update);
        break;
      case 'updateNewCallbackQuery':
        await this.handleCallbackQuery(update);
        break;
    }
  }

  private async handleMessageUpdate(
    update: TdUpdate,
    handler: (chatId: number, messageId: number) => Promise<void>,
  ) {
    const rawChatId = update.message?.chat_id ?? update.chat_id;
    const rawMessageId = update.message?.id ?? update.message_id;
    if (!rawChatId || !rawMessageId) return;
    const messageId = tdlibMessageIdToBotApi(rawMessageId);
    if (!messageId) {
      this.log.warn('无法转换 TDLib 消息 ID', rawMessageId, update);
      return;
    }
    // 同样要做 chat_id 归一化，否则 onTdlibMessage 拿裸 channelId 去 getMessages 会找不到
    const chatId = tdlibChatIdToBotApi(rawChatId);
    if (chatId === null) {
      this.log.warn('无法转换 TDLib chat_id', rawChatId);
      return;
    }
    await handler(chatId, messageId);
  }

  private async handleDeleteMessages(update: TdUpdate) {
    if (!update.chat_id || !update.message_ids?.length) return;
    const messageIds = update.message_ids
      .map(tdlibMessageIdToBotApi)
      .filter(Boolean);
    this.log.debug('收到 TDLib 删除事件', {
      chatId: update.chat_id,
      rawMessageIds: update.message_ids,
      messageIds,
      isPermanent: update.is_permanent,
      fromCache: update.from_cache,
    });
    if (!messageIds.length) return;
    const chatId = tdlibChatIdToBotApi(update.chat_id);
    if (chatId === null) {
      this.log.warn('无法转换 TDLib chat_id', update.chat_id);
      return;
    }
    await this.onDeletedMessages({
      // TDLib 的 chat_id 和 GramJS / Pair.tgId 的表示不一致，必须转换，
      // 否则上层 forwardPairs.find() 匹配不上，删除会被静默丢弃
      chatId,
      messageIds,
      isPermanent: update.is_permanent ?? true,
      fromCache: update.from_cache ?? false,
    });
  }

  private async handleCallbackQuery(update: TdUpdate) {
    if (update.id === undefined) return;
    const answer = async () => {
      await this.client.invoke({
        _: 'answerCallbackQuery',
        callback_query_id: update.id,
        text: '',
        show_alert: false,
        url: '',
        cache_time: 0,
      });
    };

    const data = this.getCallbackQueryPayloadData(update);
    if (!data) {
      await answer();
      return;
    }
    await this.onCallbackQuery(data, answer);
  }

  private getCallbackQueryPayloadData(update: TdUpdate) {
    if (update.payload?._ !== 'callbackQueryPayloadData' || typeof update.payload.data !== 'string') {
      return undefined;
    }
    return Buffer.from(update.payload.data, 'base64');
  }
}
