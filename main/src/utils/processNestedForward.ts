import { ForwardMessage } from '../client/QQClient';
import forwardHelper from '../helpers/forwardHelper';
import db from '../models/db';

export default async (messages: ForwardMessage[], fromPairId: number) => {
  for (const message of messages) {
    if (typeof message.message === 'string') continue;
    for (const elem of message.message) {
      if (elem.type !== 'json') continue;
      const parsed = forwardHelper.processJson(elem.data);
      if (parsed.type !== 'forward') continue;
      let entity = await db.forwardMultiple.findFirst({ where: { resId: parsed.resId } });
      if (!entity) {
        entity = await db.forwardMultiple.create({
          data: {
            resId: parsed.resId,
            fileName: parsed.fileName,
            fromPairId,
          },
        });
      }
      elem.data = JSON.stringify({ type: 'forward', uuid: entity.id });
    }
  }
}
