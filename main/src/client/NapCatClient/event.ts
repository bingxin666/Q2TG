import { FriendRequestEvent, Gender, GroupInviteEvent, GroupRequestEvent, RequestEvent } from '../../types/qq-types';
import { NapCatClient } from './client';
import { getLogger, Logger } from 'log4js';
import posthog from '../../models/posthog';
import { WSReceiveHandler, WSSendReturn } from 'node-napcat-ts';
import { GroupRole } from '../../types/qq-types';

export abstract class NapCatRequestEvent implements RequestEvent {
  readonly post_type: 'request' = 'request';
  readonly seq = 0;

  protected constructor(
    public readonly user_id: number,
    public readonly nickname: string,
    public readonly flag: string,
    public readonly time: number,
  ) {
  }

  abstract approve(yes?: boolean): Promise<boolean>
}

export class NapCatFriendRequestEvent extends NapCatRequestEvent implements FriendRequestEvent {
  public readonly request_type: 'friend' = 'friend';
  public readonly sub_type: 'add' = 'add';
  public readonly source: string = '';
  private readonly logger: Logger;

  private constructor(
    public readonly client: NapCatClient,
    user_id: number, nickname: string, flag: string, time: number,
    public readonly comment: string,
    public readonly age: number,
    public readonly sex: Gender,
  ) {
    super(user_id, nickname, flag, time);
    this.logger = getLogger(`NapCatFriendRequestEvent - ${client.id} - ${user_id}`);
  }

  public static async create(client: NapCatClient, data: WSReceiveHandler['request.friend']): Promise<NapCatFriendRequestEvent> {
    const info = await client.callApi('get_stranger_info', { user_id: data.user_id });
    return new this(client, data.user_id, info.nickname, data.flag, data.time, data.comment, info.age, info.sex);
  }

  async approve(yes = true): Promise<boolean> {
    try {
      await this.client.callApi('set_friend_add_request', { flag: this.flag, approve: yes });
      this.logger.info('已处理好友申请', yes ? '同意' : '拒绝');
      return true;
    }
    catch (e) {
      this.logger.error('处理好友申请失败', e);
      posthog.capture('NapCat 处理好友申请失败', { error: e });
      return false;
    }
  }
}

export abstract class NapCatGroupEvent extends NapCatRequestEvent {
  public readonly request_type: 'group' = 'group';
  public readonly sub_type: 'add' | 'invite';
  private readonly logger: Logger;

  protected constructor(
    public readonly client: NapCatClient,
    user_id: number, nickname: string, flag: string, time: number,
    public readonly group_id: number,
    public readonly group_name: string,
    public readonly comment: string,
  ) {
    super(user_id, nickname, flag, time);
    this.logger = getLogger(`NapCatFriendRequestEvent - ${client.id} - ${user_id}`);
  }

  public static async create(client: NapCatClient, data: WSReceiveHandler['request.group']): Promise<NapCatGroupEvent> {
    const info = await client.callApi('get_stranger_info', { user_id: data.user_id });
    const groupInfo = await client.callApi('get_group_info', { group_id: data.group_id });
    switch (data.sub_type) {
      case 'add':
        // 应该不会被用到
        return new NapCatGroupRequestEvent(client, data.user_id, info.nickname, data.flag, data.time, data.group_id, groupInfo.group_name, data.comment);
      case 'invite':
        return await NapCatGroupInviteEvent.creatte(client, data, info, groupInfo);
    }
  }

  async approve(yes = true): Promise<boolean> {
    try {
      await this.client.callApi('set_group_add_request', { flag: this.flag, approve: yes });
      this.logger.info('已处理好友申请', yes ? '同意' : '拒绝');
      return true;
    }
    catch (e) {
      this.logger.error('处理好友申请失败', e);
      posthog.capture('NapCat 处理好友申请失败', { error: e });
      return false;
    }
  }
}

export class NapCatGroupRequestEvent extends NapCatGroupEvent implements GroupRequestEvent {
  public readonly sub_type: 'add' = 'add';
  public readonly inviter_id = 0;
  public readonly tips: string = '';

  public constructor(
    client: NapCatClient,
    user_id: number, nickname: string, flag: string, time: number,
    group_id: number, group_name: string, comment: string,
  ) {
    super(client, user_id, nickname, flag, time, group_id, group_name, comment);
  }
}

export class NapCatGroupInviteEvent extends NapCatGroupEvent implements GroupInviteEvent {
  public readonly sub_type: 'invite' = 'invite';

  private constructor(
    client: NapCatClient,
    user_id: number, nickname: string, flag: string, time: number,
    group_id: number, group_name: string, comment: string,
    public readonly role: GroupRole,
  ) {
    super(client, user_id, nickname, flag, time, group_id, group_name, comment);
  }

  public static async creatte(client: NapCatClient, data: WSReceiveHandler['request.group'], info: WSSendReturn['get_stranger_info'], groupInfo: WSSendReturn['get_group_info']): Promise<NapCatGroupInviteEvent> {
    const memberInfo = await client.callApi('get_group_member_info', { group_id: data.group_id, user_id: data.user_id });
    return new this(client, data.user_id, info.nickname, data.flag, data.time, data.group_id, groupInfo.group_name, data.comment, memberInfo.role);
  }
}
