import { CallbackQueryEvent } from 'telegram/events/CallbackQuery';

export interface CallbackQueryPayloadEvent {
  data: Buffer;
  answer: () => Promise<unknown>;
}

export type CallbackQueryHandler = (event: CallbackQueryEvent | CallbackQueryPayloadEvent) => any;

export default class CallbackQueryHelper {
  private readonly queries: Array<CallbackQueryHandler> = [];

  public registerCallback(cb: CallbackQueryHandler) {
    const id = this.queries.push(cb) - 1;
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(id);
    return buf;
  }

  public onCallbackQuery = async (event: CallbackQueryEvent) => {
    await this.onCallbackQueryPayload(event.query.data, () => event.answer(), event);
  };

  public onCallbackQueryPayload = async (
    data: Buffer,
    answer: () => Promise<unknown>,
    callbackEvent: CallbackQueryEvent | CallbackQueryPayloadEvent = { data, answer },
  ) => {
    if (data.length >= 2) {
      const id = data.readUInt16LE();
      if (this.queries[id]) {
        this.queries[id](callbackEvent);
      }
    }
    try {
      await answer();
    }
    catch {
    }
  };
}
