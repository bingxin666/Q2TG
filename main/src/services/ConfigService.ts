import Telegram from '../client/Telegram';
import { Button } from 'telegram/tl/custom/button';
import { getLogger, Logger } from 'log4js';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import db from '../models/db';
import { Api } from 'telegram';
import { md5 } from '../utils/hashing';
import TelegramChat from '../client/TelegramChat';
import Instance from '../models/Instance';
import getAboutText from '../utils/getAboutText';
import random from '../utils/random';
import { Friend, Group, QQClient } from '../client/QQClient';
import posthog from '../models/posthog';

export default class ConfigService {
  private owner: Promise<TelegramChat>;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: QQClient) {
    this.log = getLogger(`ConfigService - ${instance.id}`);
    this.owner = tgBot.getChat(this.instance.owner);
  }

  private getAssociateLink(roomId: number) {
    return `https://t.me/${this.tgBot.me.username}?startgroup=${roomId}`;
  }

  // region 打开添加关联的菜单

  // 开始添加转发群组流程
  public async addGroup() {
    const qGroups = (await this.oicq.getGroupList())
      .filter(it => !this.instance.forwardPairs.find(-it.gid));
    const buttons = qGroups.map(e =>
      this.instance.workMode === 'personal' ?
        [Button.inline(
          `${e.name} (${e.gid})`,
          this.tgBot.registerCallback(() => this.onSelectChatPersonal(e)),
        )] :
        [Button.url(
          `${e.name} (${e.gid})`,
          this.getAssociateLink(-e.gid),
        )]);
    await (await this.owner).createPaginatedInlineSelector(
      '选择 QQ 群组' + (this.instance.workMode === 'group' ? '\n然后选择在 TG 中的群组' : ''), buttons);
  }

  // 只可能是 personal 运行模式
  public async addFriend() {
    const friends = await this.oicq.getFriendsWithCluster();
    await (await this.owner).createPaginatedInlineSelector('选择分组', friends.map(e => [
      Button.inline(e.name || '(未知名称)', this.tgBot.registerCallback(
        () => this.openFriendSelection(e.friends, e.name),
      )),
    ]));
  }

  private async openFriendSelection(clazz: Friend[], name: string) {
    clazz = clazz.filter(them => !this.instance.forwardPairs.find(them.uin));
    await (await this.owner).createPaginatedInlineSelector(`选择 QQ 好友\n分组：${name}`, clazz.map(e => [
      Button.inline(`${e.remark || e.nickname} (${e.uin})`, this.tgBot.registerCallback(
        () => this.onSelectChatPersonal(e),
      )),
    ]));
  }

  private async onSelectChatPersonal(entity: Friend | Group) {
    const roomId = 'uin' in entity ? entity.uin : -entity.gid;
    const name = 'uin' in entity ? entity.remark || entity.nickname : entity.name;
    const avatar = await getAvatar(roomId);
    const message = await (await this.owner).sendMessage({
      message: await getAboutText(entity, true) + '\n\n由于不再支持 UserBot，请手动创建 Telegram 群组并关联：\n' +
        '1. 创建一个新的 Telegram 群组\n' +
        '2. 将机器人 @' + this.tgBot.me.username + ' 添加到群组\n' +
        '3. 将机器人设置为管理员\n' +
        '4. 在群组中发送 /start@' + this.tgBot.me.username + ' ' + roomId + ' 命令关联群组',
      buttons: [
        [Button.url('手动选择现有群组', this.getAssociateLink(roomId))],
      ],
      file: new CustomFile('avatar.png', avatar.length, '', avatar),
    });
  }

  public async addExact(gin: number) {
    const group = await this.oicq.pickGroup(gin);
    let avatar: Buffer;
    try {
      avatar = await getAvatar(-group.gid);
    }
    catch (e) {
      avatar = null;
      this.log.error(`加载 ${group.name} (${gin}) 的头像失败`, e);
      posthog.capture('加载头像失败', { error: e });
    }
    const message = `${group.name}\n${group.gid}`;
    await (await this.owner).sendMessage({
      message,
      file: avatar ? new CustomFile('avatar.png', avatar.length, '', avatar) : undefined,
      buttons: Button.url('关联 Telegram 群组', this.getAssociateLink(-group.gid)),
    });
  }

  // endregion

  /**
   *
   * @param room
   * @param title
   * @param status 传入 false 的话就不显示状态信息，可以传入一条已有消息覆盖
   * @param chat
   */
  public async createGroupAndLink(room: number | Friend | Group, title?: string, status: boolean | Api.Message = true, chat?: TelegramChat, qqFromGroupId?: number) {
    this.log.info(`创建群组并关联：${room}`);
    if (typeof room === 'number') {
      room = await this.oicq.getChat(room, qqFromGroupId);
    }
    if (!title) {
      // TS 这边不太智能
      if ('uin' in room) {
        title = room.remark || room.nickname;
      }
      else {
        title = room.name;
      }
    }
    if (!title && 'uin' in room && qqFromGroupId) {
      // 可能是群临时，通过 QQClient 获取成员信息
      try {
        const chat = await this.oicq.getChat(room.uin, qqFromGroupId);
        if (chat && 'remark' in chat) {
          title = (chat as any).remark || (chat as any).nickname;
        }
      }
      catch {
        // ignore
      }
    }

    const roomId = 'uin' in room ? room.uin : -room.gid;

    if (!chat) {
      // Without UserBot, prompt user to manually create a group
      const avatar = await getAvatar(room);
      const statusReceiver = await this.owner;
      if (status === true) {
        status = await statusReceiver.sendMessage({
          message: '正在创建 Telegram 群…',
          file: new CustomFile('avatar.png', avatar.length, '', avatar),
        });
      }
      else if (status instanceof Api.Message) {
        await status.edit({ text: '正在创建 Telegram 群…', buttons: Button.clear() });
      }

      await statusReceiver.sendMessage({
        message: '由于不再支持 UserBot，请手动创建 Telegram 群组：\n' +
          '1. 创建一个新的 Telegram 群组\n' +
          '2. 将机器人 @' + this.tgBot.me.username + ' 添加到群组\n' +
          '3. 将机器人设置为管理员\n' +
          '4. 在群组中发送 /start@' + this.tgBot.me.username + ' ' + roomId + ' 命令关联群组',
      });
      return;
    }

    let isFinish = false;
    try {
      let errorMessage = '';

      // 关联写入数据库
      const chatForBot = await this.tgBot.getChat(chat.id);
      if (status instanceof Api.Message) {
        await status.edit({ text: '正在写数据库…' });
      }
      this.log.debug('正在写数据库:', room, chatForBot, chat, this.oicq, qqFromGroupId);
      const dbPair = await this.instance.forwardPairs.add(room, chatForBot, this.oicq, qqFromGroupId);
      isFinish = true;

      // 更新头像
      try {
        if (status instanceof Api.Message) {
          await status.edit({ text: '正在更新头像…' });
        }
        const avatar = await getAvatar(room);
        const avatarHash = md5(avatar);
        await chatForBot.setProfilePhoto(avatar);
        await db.avatarCache.create({
          data: { forwardPairId: dbPair.id, hash: avatarHash },
        });
      }
      catch (e) {
        errorMessage += `\n更新头像失败：${e.message}`;
        posthog.capture('更新头像失败', { error: e });
      }

      // 完成
      if (status instanceof Api.Message) {
        await status.edit({ text: '正在获取链接…' });
        const { link } = await chatForBot.getInviteLink() as Api.ChatInviteExported;
        await status.edit({
          text: '创建完成！' + (errorMessage ? '但发生以下错误' + errorMessage : ''),
          buttons: Button.url('打开', link),
        });
      }
    }
    catch (e) {
      this.log.error('创建群组并关联失败', e);
      posthog.capture('创建群组并关联失败', { error: e });
      await (await this.owner).sendMessage(`创建群组并关联${isFinish ? '成功了但没完全成功' : '失败'}\n<code>${e}</code>`);
    }
  }

  public async promptNewQqChat(chat: Group | Friend) {
    const roomId = 'gid' in chat ? -chat.gid : chat.uin;
    const message = await (await this.owner).sendMessage({
      message: '你' +
        ('gid' in chat ? '加入了一个新的群' : '增加了一' + random.pick('位', '个', '只', '头') + '好友') +
        '：\n' +
        await getAboutText(chat, true) + '\n\n' +
        '由于不再支持 UserBot，请手动创建 Telegram 群组并关联：\n' +
        '1. 创建一个新的 Telegram 群组\n' +
        '2. 将机器人 @' + this.tgBot.me.username + ' 添加到群组\n' +
        '3. 将机器人设置为管理员\n' +
        '4. 在群组中发送 /start@' + this.tgBot.me.username + ' ' + roomId + ' 命令关联群组',
    });
    return message;
  }

  public async createLinkGroup(qqRoomId: number, tgChatId: number) {
    if (this.instance.workMode === 'group') {
      try {
        const qGroup = await this.oicq.getChat(qqRoomId) as Group;
        const tgChat = await this.tgBot.getChat(tgChatId);
        await this.instance.forwardPairs.add(qGroup, tgChat, this.oicq);
        await tgChat.sendMessage(`QQ群：${qGroup.name} (<code>${qGroup.gid}</code>)已与 ` +
          `Telegram 群 ${(tgChat.entity as Api.Channel).title} (<code>${tgChatId}</code>)关联`);
        if (!(tgChat.entity instanceof Api.Channel)) {
          // TODO 添加一个转换为超级群组的方法链接
          await tgChat.sendMessage({
            message: '请注意，这个群不是超级群组。一些功能，比如说同步撤回，可能会工作不正常。建议将此群组转换为超级群组',
            linkPreview: false,
          });
        }
      }
      catch (e) {
        this.log.error(e);
        posthog.capture('createLinkGroup 出错', { error: e });
        await (await this.owner).sendMessage(`错误：<code>${e}</code>`);
      }
    }
    else {
      await (await this.owner).sendMessage({
        message: '由于不再支持 UserBot，请手动创建 Telegram 群组并关联：\n' +
          '1. 创建一个新的 Telegram 群组\n' +
          '2. 将机器人 @' + this.tgBot.me.username + ' 添加到群组\n' +
          '3. 将机器人设置为管理员\n' +
          '4. 在群组中发送 /start@' + this.tgBot.me.username + ' ' + qqRoomId + ' 命令关联群组',
      });
    }
  }

  public async refreshAll() {
    const statusMessage = await (await this.owner).sendMessage('正在刷新所有头像和简介…');
    const pairs = this.instance.forwardPairs.getAll();
    let succ = 0, fail = 0;
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      try {
        await pair.updateInfo();
        succ++;
      }
      catch (e) {
        this.log.error(`刷新 ${pair.dbId} 头像和简介失败`, e);
        posthog.capture('刷新头像和简介失败', { error: e });
        fail++;
      }
      try{
        await statusMessage.edit({
          text: `正在刷新所有头像和简介…\n成功：${succ}，失败：${fail}，总数：${pairs.length}`,
        });
      }
      catch {
      }
    }
    await statusMessage.edit({
      text: `刷新完成\n成功：${succ}，失败：${fail}，总数：${pairs.length}`,
    });
  }
}
