import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import { QQClient } from '../client/QQClient';

export default class AliveCheckController {
  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: QQClient) {
    tgBot.addNewMessageEventHandler(this.handleMessage);
  }

  private handleMessage = async (message: Api.Message) => {
    if (!message.sender?.id?.eq(this.instance.owner) || !message.isPrivate) {
      return false;
    }
    if (!['似了吗', '/alive'].includes(message.message)) {
      return false;
    }

    await message.reply({
      message: await this.genMessage(this.instance.id === 0 ? Instance.instances : [this.instance]),
    });
    return true;
  };

  private async genMessage(instances: Instance[]): Promise<string> {
    const boolToStr = (value: boolean) => {
      return value ? '好' : '坏';
    };
    const messageParts: string[] = [];

    for (const instance of instances) {
      const oicq = instance.oicq;
      const tgBot = instance.tgBot;

      messageParts.push([
        `Instance #${instance.id} (${instance.workMode}) ${instance.isInit ? '' : '初始化未完成'}`,

        `QQ <code>${instance.qqUin}</code> (${oicq.constructor.name})\t` +
        `${boolToStr(await oicq.isOnline())}`,

        `TG @${tgBot.me.username}\t${boolToStr(tgBot.isOnline)}`,
      ].join('\n'));
    }

    return messageParts.join('\n\n');
  };
}
