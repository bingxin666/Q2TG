import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { MiraiElem } from '../types/qq-types';
import { MessageEvent, QQClient } from '../client/QQClient';

export default class {
  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly qqBot: QQClient) {
    qqBot.addNewMessageEventHandler(this.onQqMessage);
  }

  // 当 mapInstance 用同服务器其他个人模式账号发送消息后，message mirai 会带 q2tgSkip=true
  // 防止 bot 重新收到消息再转一圈回来重新转发或者重新响应命令
  private onQqMessage = async (event: MessageEvent) => {
    if ('friend' in event) return;
    if (!event.message) return;
    const messageMirai = event.message.find(it => it.type === 'mirai') as MiraiElem;
    if (messageMirai) {
      try {
        const miraiData = JSON.parse(messageMirai.data);
        if (miraiData.q2tgSkip) return true;
      }
      catch {
      }
    }
  };
}
