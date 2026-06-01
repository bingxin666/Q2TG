import { Friend, Group, QQClient } from '../client/QQClient';
import TelegramChat from '../client/TelegramChat';
import Telegram from '../client/Telegram';
import db from './db';
import { Entity } from 'telegram/define';
import { BigInteger } from 'big-integer';
import { Pair } from './Pair';
import { getLogger, Logger } from 'log4js';
import Instance from './Instance';

export default class ForwardPairs {
  private pairs: Pair[] = [];
  private readonly log: Logger;

  private constructor(private readonly instanceId: number) {
    this.log = getLogger(`ForwardPairs - ${instanceId}`);
  }

  // 在 forwardController 创建时初始化
  private async init(oicq: QQClient, tgBot: Telegram) {
    const dbValues = await db.forwardPair.findMany({
      where: { instanceId: this.instanceId },
    });
    for (const i of dbValues) {
      try {
        const qq = await oicq.getChat(Number(i.qqRoomId), i.qqFromGroupId ? Number(i.qqFromGroupId) : undefined);
        const tg = await tgBot.getChat(Number(i.tgChatId));
        if (qq && tg) {
          this.log.debug('初始化', { qq, tg });
          this.pairs.push(new Pair(qq, tg, i.id, i.flags, i.apiKey, oicq));
        }
      }
      catch (e) {
        this.log.warn(`初始化遇到问题，QQ: ${i.qqRoomId} TG: ${i.tgChatId}`);
      }
    }
  }

  public static async load(instanceId: number, oicq: QQClient, tgBot: Telegram) {
    const instance = new this(instanceId);
    await instance.init(oicq, tgBot);
    return instance;
  }

  public async add(qq: Friend | Group, tg: TelegramChat, qqClient: QQClient, qqFromGroupId?: number) {
    const dbEntry = await db.forwardPair.create({
      data: {
        qqRoomId: 'uin' in qq ? qq.uin : -qq.gid,
        tgChatId: Number(tg.id),
        instanceId: this.instanceId,
        qqFromGroupId,
      },
    });
    this.pairs.push(new Pair(qq, tg, dbEntry.id, dbEntry.flags, dbEntry.apiKey, qqClient));
    return dbEntry;
  }

  public async remove(pair: Pair) {
    this.pairs.splice(this.pairs.indexOf(pair), 1);
    await db.forwardPair.delete({
      where: { id: pair.dbId },
    });
  }

  public find(target: Friend | Group | TelegramChat | Entity | number | BigInteger) {
    if (!target) return null;
    if (typeof target === 'object' && 'uin' in target) {
      return this.pairs.find(e => 'uin' in e.qq && e.qq.uin === target.uin && e.qq.dm);
    }
    else if (typeof target === 'object' && 'gid' in target) {
      return this.pairs.find(e => 'gid' in e.qq && e.qq.gid === target.gid && !e.qq.dm);
    }
    else if (typeof target === 'number' || 'eq' in target) {
      return this.pairs.find(e => e.qqRoomId === target || e.tg.id.eq(target));
    }
    else {
      return this.pairs.find(e => e.tg.id.eq(target.id));
    }
  }

  public async initMapInstance(instances: Instance[]) {
    // MapInstance requires UserBot which has been removed
  }

  public getAll() {
    return this.pairs;
  }
}
