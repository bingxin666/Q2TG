import Telegram from '../client/Telegram';
import { getLogger, Logger } from 'log4js';
import { Api } from 'telegram';
import db from '../models/db';
import Instance from '../models/Instance';
import { Pair } from '../models/Pair';
import { consumer } from '../utils/highLevelFunces';
import forwardHelper from '../helpers/forwardHelper';
import flags from '../constants/flags';
import { MessageRecallEvent, Group, Friend } from '../client/QQClient';
import posthog from '../models/posthog';
import { TelegramDeletedMessagesEvent } from '../client/TelegramDeletedMessages';
import env from '../models/env';

type MappedMessageInfo = Awaited<ReturnType<typeof db.message.findMany>>[number];

export default class DeleteMessageService {
  private readonly log: Logger;
  private readonly lockIds = new Set<string>();
  private readonly pollingDeletedMessageKeys = new Set<string>();
  private pollingTimer?: NodeJS.Timeout;
  private pollingRunning = false;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    this.log = getLogger(`DeleteMessageService - ${instance.id}`);
  }

  private lock(lockId: string) {
    if (this.lockIds.has(lockId)) {
      this.log.debug('重复执行消息撤回', lockId);
      return true;
    }
    this.lockIds.add(lockId);
    setTimeout(() => this.lockIds.delete(lockId), 5000);
  }

  private getPollingKey(pair: Pair, messageId: number) {
    return `${pair.tgId}:${messageId}`;
  }

  // 500ms 内只撤回一条消息，防止频繁导致一部分消息没有成功撤回。不过这样的话，会得不到返回的结果
  private recallQqMessage = consumer(async (qq: Friend | Group, seq: number, rand: number, timeOrPktnum: number, pair: Pair, isOthersMsg: boolean, noSendError = false) => {
    try {
      const result = await qq.recallMsg(seq, rand, timeOrPktnum);
      if (!result) throw new Error('撤回失败');
    }
    catch (e) {
      this.log.error('撤回失败', e);
      posthog.capture('撤回 QQ 消息失败', { error: e });
      if (noSendError) return;
      const tipMsg = await pair.tg.sendMessage({
        message: '<i>撤回 QQ 中对应的消息失败' +
          (this.instance.workMode === 'group' ? '，QQ Bot 需要是管理员' : '') +
          (isOthersMsg ? '，而且无法撤回其他管理员的消息' : '') +
          '</i>' +
          (e.message ? '\n' + e.message : ''),
        silent: true,
      });
      this.instance.workMode === 'group' && setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
    }
  }, 1000);

  public startTelegramDeleteFallbackPolling() {
    if (!env.TG_DELETE_POLLING) {
      this.log.info('Telegram 删除兜底轮询未启用');
      return;
    }
    if (this.pollingTimer) return;

    const intervalMs = Math.max(env.TG_DELETE_POLL_INTERVAL_SECONDS, 10) * 1000;
    this.log.info('Telegram 删除兜底轮询已启动', {
      intervalSeconds: Math.round(intervalMs / 1000),
      windowSeconds: env.TG_DELETE_POLL_WINDOW_SECONDS,
      graceSeconds: env.TG_DELETE_POLL_GRACE_SECONDS,
      batchSize: env.TG_DELETE_POLL_BATCH_SIZE,
    });

    this.pollingTimer = setInterval(() => {
      this.pollTelegramDeletedMessages()
        .catch(e => {
          this.log.error('Telegram 删除兜底轮询失败', e);
          posthog.capture('Telegram 删除兜底轮询失败', { error: e });
        });
    }, intervalMs);
    this.pollingTimer.unref?.();
    setTimeout(() => {
      this.pollTelegramDeletedMessages()
        .catch(e => {
          this.log.error('Telegram 删除兜底轮询失败', e);
          posthog.capture('Telegram 删除兜底轮询失败', { error: e });
        });
    }, 0);
  }

  public stopTelegramDeleteFallbackPolling() {
    if (!this.pollingTimer) return;
    clearInterval(this.pollingTimer);
    this.pollingTimer = undefined;
  }

  private async pollTelegramDeletedMessages() {
    if (this.pollingRunning) {
      this.log.debug('上一次 Telegram 删除兜底轮询尚未结束，跳过本轮');
      return;
    }
    this.pollingRunning = true;
    try {
      for (const pair of this.instance.forwardPairs.getAll()) {
        await this.pollTelegramDeletedMessagesForPair(pair);
      }
    }
    finally {
      this.pollingRunning = false;
    }
  }

  private async pollTelegramDeletedMessagesForPair(pair: Pair) {
    const now = Math.floor(Date.now() / 1000);
    const minTime = now - env.TG_DELETE_POLL_WINDOW_SECONDS;
    const maxTime = now - env.TG_DELETE_POLL_GRACE_SECONDS;
    if (maxTime < minTime) return;

    let lastId: number | undefined;
    let checkedCount = 0;
    let deletedCount = 0;
    const batchSize = Math.max(env.TG_DELETE_POLL_BATCH_SIZE, 1);

    while (true) {
      const messages = await db.message.findMany({
        where: {
          tgChatId: pair.tgId,
          instanceId: this.instance.id,
          ignoreDelete: false,
          time: {
            gte: minTime,
            lte: maxTime,
          },
          id: lastId ? { lt: lastId } : undefined,
          tgSenderId: {
            not: BigInt(this.tgBot.me.id.toString()),
          },
        },
        orderBy: { id: 'desc' },
        take: batchSize,
      });
      if (!messages.length) break;
      lastId = messages[messages.length - 1].id;

      const deletedMessageIds = await this.findDeletedTelegramMessageIds(pair, messages);
      checkedCount += new Set(messages.map(message => message.tgMsgId)).size;
      deletedCount += deletedMessageIds.length;

      for (const messageId of deletedMessageIds) {
        const key = this.getPollingKey(pair, messageId);
        if (this.pollingDeletedMessageKeys.has(key)) continue;
        this.pollingDeletedMessageKeys.add(key);
        this.log.info('Telegram 删除兜底轮询发现已删除消息', {
          tgChatId: pair.tgId,
          tgMsgId: messageId,
          instanceId: this.instance.id,
        });
        await this.telegramDeleteMessage(messageId, pair, true);
      }

      if (messages.length < batchSize) break;
    }

    if (checkedCount) {
      this.log.debug('Telegram 删除兜底轮询检查完成', {
        tgChatId: pair.tgId,
        checkedCount,
        deletedCount,
        instanceId: this.instance.id,
      });
    }
  }

  private async findDeletedTelegramMessageIds(pair: Pair, messages: MappedMessageInfo[]) {
    const messageIds = [...new Set(messages.map(message => message.tgMsgId))];
    if (!messageIds.length) return [];

    let existingMessages: Array<Api.Message | Api.MessageService | undefined>;
    try {
      existingMessages = await this.tgBot.getMessage(pair.tg.entity, { ids: messageIds }) as Array<Api.Message | Api.MessageService | undefined>;
    }
    catch (e) {
      this.log.warn('Telegram 删除兜底轮询查询消息失败', {
        tgChatId: pair.tgId,
        messageIds,
        error: e.message,
      });
      return [];
    }

    const existingMessageIds = new Set(existingMessages
      .filter((message): message is Api.Message | Api.MessageService => !!message && typeof message.id === 'number')
      .map(message => message.id));
    return messageIds.filter(messageId => !existingMessageIds.has(messageId));
  }

  /**
   * 删除 QQ 对应的消息
   * @param messageId
   * @param pair
   * @param isOthersMsg
   */
  async telegramDeleteMessage(messageId: number, pair: Pair, isOthersMsg = false) {
    // 删除的时候会返回记录
    if (this.lock(`tg-${pair.tgId}-${messageId}`)) return;
    try {
      this.log.debug('准备同步 Telegram 删除到 QQ', {
        tgChatId: pair.tgId,
        tgMsgId: messageId,
        instanceId: this.instance.id,
        qqRoomId: pair.qqRoomId,
      });
      const messageInfos = await db.message.findMany({
        where: {
          tgChatId: pair.tgId,
          tgMsgId: messageId,
          instanceId: this.instance.id,
        },
      });
      if (!messageInfos.length) {
        this.log.debug('未找到 Telegram 消息映射，无法同步删除到 QQ', {
          tgChatId: pair.tgId,
          tgMsgId: messageId,
          instanceId: this.instance.id,
        });
      }
      for (const messageInfo of messageInfos) {
        await this.recallMappedQqMessage(messageInfo, messageId, pair, isOthersMsg);
      }
    }
    catch (e) {
    }
  }

  private async recallMappedQqMessage(messageInfo: MappedMessageInfo, messageId: number, pair: Pair, isOthersMsg: boolean) {
    try {
      if (this.lock(`qq-${pair.qqRoomId}-${messageInfo.seq}`)) return;
      if (messageInfo.ignoreDelete) {
        this.log.debug('消息设置了 ignoreDelete，跳过同步删除', {
          tgChatId: pair.tgId,
          tgMsgId: messageId,
          messageDbId: messageInfo.id,
        });
        return;
      }
      const mapQq = messageInfo.tgSenderId && pair.instanceMapForTg[messageInfo.tgSenderId.toString()];
      mapQq && this.recallQqMessage(mapQq, messageInfo.seq, Number(messageInfo.rand), messageInfo.pktnum, pair, false, true);
      // 假如 mapQQ 是普通成员，机器人是管理员，上面撤回失败了也可以由机器人撤回
      // 所以撤回两次
      // 不知道哪次会成功，所以就都不发失败提示了
      this.recallQqMessage(pair.qq, messageInfo.seq, Number(messageInfo.rand),
        pair.qq.dm ? messageInfo.time : messageInfo.pktnum,
        pair, isOthersMsg, !!mapQq);
      // 有 lock 了，这里不需要删除数据库了
    }
    catch (e) {
      this.log.error(e);
      posthog.capture('telegramDeleteMessage 出错', { error: e });
    }
  }

  public async handleTelegramDeletedMessages(event: TelegramDeletedMessagesEvent) {
    this.log.debug('处理 Telegram 删除事件', {
      chatId: event.chatId,
      messageIds: event.messageIds,
      isPermanent: event.isPermanent,
      fromCache: event.fromCache,
      instanceId: this.instance.id,
    });
    if (event.fromCache || !event.isPermanent) {
      this.log.debug('忽略非永久或缓存导致的 Telegram 删除事件', event);
      return;
    }
    const pair = this.instance.forwardPairs.find(event.chatId);
    if (!pair) {
      this.log.debug('Telegram 删除事件未匹配到转发 Pair', {
        chatId: event.chatId,
        messageIds: event.messageIds,
        instanceId: this.instance.id,
      });
      return;
    }
    for (const messageId of event.messageIds) {
      await this.telegramDeleteMessage(messageId, pair, true);
    }
  }

  /**
   * 处理 TG 里面发送的 /rm
   * @param message
   * @param pair
   */
  async handleTelegramMessageRm(message: Api.Message, pair: Pair) {
    const replyMessage = await message.getReplyMessage();
    if (replyMessage instanceof Api.Message) {
      // 检查权限并撤回被回复的消息
      let hasPermission = this.instance.workMode === 'personal' || replyMessage.senderId?.eq(message.senderId);
      if (!hasPermission && message.chat instanceof Api.Channel) {
        // 可能是超级群
        try {
          const member = (await pair.tg.getMember(message.sender)).participant;
          hasPermission = member instanceof Api.ChannelParticipantCreator ||
            (member instanceof Api.ChannelParticipantAdmin && member.adminRights.deleteMessages);
        }
        catch (e) {
          // 不管了
        }
      }
      if (!hasPermission && message.chat instanceof Api.Chat) {
        // 不是超级群，我也不知道怎么判断，而且应该用不到
      }
      if (hasPermission) {
        // 双平台撤回被回复的消息
        // 撤回 QQ 的
        await this.telegramDeleteMessage(message.replyToMsgId, pair, replyMessage.senderId?.eq(this.tgBot.me.id));
        try {
          // 撤回 TG 的
          await pair.tg.deleteMessages(message.replyToMsgId);
        }
        catch (e) {
          posthog.capture('撤回 TG 消息失败', { error: e });
          await pair.tg.sendMessage(`<i>删除消息失败</i>：${e.message}`);
        }
      }
      else {
        const tipMsg = await pair.tg.sendMessage({
          message: '<i>不能撤回别人的消息</i>',
          silent: true,
        });
        setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
      }
    }
    // 撤回消息本身
    try {
      await message.delete({ revoke: true });
    }
    catch (e) {
      posthog.capture('Bot 目前无法撤回其他用户的消息，Bot 需要「删除消息」权限', { error: e });
      const tipMsg = await message.reply({
        message: '<i>Bot 目前无法撤回其他用户的消息，Bot 需要「删除消息」权限</i>',
        silent: true,
      });
      setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
    }
  }

  public async handleQqRecall(event: MessageRecallEvent, pair: Pair) {
    if (this.lock(`qq-${pair.qqRoomId}-${event.seq}`)) return;
    try {
      const message = await db.message.findFirst({
        where: {
          seq: event.seq,
          rand: event.rand,
          qqRoomId: pair.qqRoomId,
          instanceId: this.instance.id,
        },
      });
      if (!message) return;
      if (this.lock(`tg-${pair.tgId}-${message.tgMsgId}`)) return;
      if (message.ignoreDelete) return;
      if ((pair.flags | this.instance.flags) & flags.DISABLE_DELETE_MESSAGE) {
        await pair.tg.editMessages({
          message: message.tgMsgId,
          text: `<del>${message.tgMessageText}</del>\n<i>此消息已删除</i>`,
          parseMode: 'html',
        });
      }
      else {
        await pair.tg.deleteMessages(message.tgMsgId);
        // 有 lock 了，这里不需要删除数据库了
      }
    }
    catch (e) {
      posthog.capture('处理 QQ 消息撤回失败', { error: e });
      this.log.error('处理 QQ 消息撤回失败', e);
    }
  }

  public async isInvalidEdit(message: Api.Message, pair: Pair) {
    const messageInfo = await db.message.findFirst({
      where: {
        tgChatId: pair.tgId,
        tgMsgId: message.id,
        instanceId: this.instance.id,
      },
    });
    if (!messageInfo) return false;
    const isTextSame = messageInfo.tgMessageText === message.message;
    if (forwardHelper.getMessageDocumentId(message)) {
      return forwardHelper.getMessageDocumentId(message) === messageInfo.tgFileId && isTextSame;
    }
    return isTextSame;
  }
}
