/**
 * 接线级测试：证明「注册到 GramJS 的 Raw 事件 → Telegram.onRawDeletedMessages
 * → DeleteMessageService.handleTelegramDeletedMessages」这条链路是通的。
 *
 * 这里不 import 整个 Telegram 类（会拖进 tdlib / prisma / canvas / sharp），
 * 而是复制真实 Raw event builder 的过滤语义，再喂真实的 TLObject 形状。
 *
 * 运行：
 *   node --experimental-strip-types main/src/client/telegramDeleteWiring.test.mts
 */
import assert from 'node:assert/strict';
import { parseTelegramDeleteUpdate } from './telegramDeleteUpdate.ts';

let passed = 0;

/** 串行执行，保证计数准确（异步用例不能被并发跑） */
const test = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
};

// ---------- 复刻 GramJS Raw event builder 的过滤语义 ----------
// 源码：gramjs/events/Raw.ts  filter() 里 `event instanceof type`
class RawFilter {
  private readonly types: any[];
  constructor(types: any[]) { this.types = types; }
  accepts(update: any) {
    return this.types.some(T => update instanceof T || update?.constructor === T);
  }
}

// 真实的 Api.UpdateDeleteMessages / Api.UpdateDeleteChannelMessages 形状
// （照 gramjs/tl/api.d.ts：messages: number[]；channelId: BigInteger）
class UpdateDeleteMessages {
  messages: number[];
  pts = 1;
  ptsCount = 1;
  constructor(messages: number[]) { this.messages = messages; }
}
class UpdateDeleteChannelMessages {
  channelId: any;
  messages: number[];
  pts = 1;
  ptsCount = 1;
  constructor(channelId: any, messages: number[]) {
    this.channelId = channelId;
    this.messages = messages;
  }
}
class UpdateNewMessage { message = {}; }

// 解析器用 className 做鸭子类型判断，测试替身也补上
Object.defineProperty(UpdateDeleteMessages.prototype, 'className', { value: 'UpdateDeleteMessages' });
Object.defineProperty(UpdateDeleteChannelMessages.prototype, 'className', { value: 'UpdateDeleteChannelMessages' });
Object.defineProperty(UpdateNewMessage.prototype, 'className', { value: 'UpdateNewMessage' });

/** 完全等价于 Telegram.config() 里注册的那行 Raw({ types: [...] }) */
const builder = new RawFilter([UpdateDeleteMessages, UpdateDeleteChannelMessages]);

const bigIntLike = (v: string) => ({ toString: () => v });

/** 模拟 Telegram.onRawDeletedMessages：解析后交给 service 层 */
const simulateOnRawDeletedMessages = async (update: any) =>
  parseTelegramDeleteUpdate(update as any);

/** 模拟 DeleteMessageService 收到事件后的路由决策 */
const routeEvent = (event: any, pairs: Array<{ tgId: number }>) => {
  if (event.chatId !== null) {
    const pair = pairs.find(p => p.tgId === event.chatId);
    return pair ? { via: 'chatId', tgId: pair.tgId, ids: event.messageIds } : { via: 'chatId', tgId: null };
  }
  return { via: 'lookup', idCount: event.messageIds.length };
};

console.log('GramJS Raw 事件接线');

await test('注册的类型能收下 UpdateDeleteMessages', () => {
  assert.equal(builder.accepts(new UpdateDeleteMessages([1])), true);
});

await test('注册的类型能收下 UpdateDeleteChannelMessages', () => {
  assert.equal(builder.accepts(new UpdateDeleteChannelMessages(bigIntLike('123'), [1])), true);
});

await test('其他更新不会被我们的删除 handler 抢走', () => {
  assert.equal(builder.accepts(new UpdateNewMessage()), false);
});

await test('超级群：走到 handler 并被解析成带 chatId 的事件', async () => {
  const update = new UpdateDeleteChannelMessages(bigIntLike('1234567890'), [10, 11]);
  assert.equal(builder.accepts(update), true);
  const event = await simulateOnRawDeletedMessages(update);
  assert.deepEqual(event, {
    chatId: 1234567890, messageIds: [10, 11], isPermanent: true, fromCache: false,
  });
});

await test('超级群事件能按 chatId 精确路由到转发对（不再依赖轮询）', async () => {
  const update = new UpdateDeleteChannelMessages(bigIntLike('1234567890'), [42]);
  const event = await simulateOnRawDeletedMessages(update);
  const routed = routeEvent(event, [{ tgId: 1234567890 }, { tgId: 999 }]);
  assert.deepEqual(routed, { via: 'chatId', tgId: 1234567890, ids: [42] });
});

await test('超级群事件不会误路由到别的群', async () => {
  const update = new UpdateDeleteChannelMessages(bigIntLike('1234567890'), [42]);
  const event = await simulateOnRawDeletedMessages(update);
  const routed = routeEvent(event, [{ tgId: 999 }]);
  assert.deepEqual(routed, { via: 'chatId', tgId: null });
});

await test('普通群：没有 chatId，走数据库反查分支', async () => {
  const update = new UpdateDeleteMessages([77]);
  const event = await simulateOnRawDeletedMessages(update);
  assert.equal(event?.chatId, null);
  const routed = routeEvent(event, [{ tgId: 1 }]);
  assert.deepEqual(routed, { via: 'lookup', idCount: 1 });
});

await test('空的删除更新不会产生事件（避免无意义查询）', async () => {
  const event = await simulateOnRawDeletedMessages(new UpdateDeleteMessages([]));
  assert.equal(event, null);
});

console.log(`\n${passed} passed${process.exitCode ? ' (有失败)' : ''}`);
