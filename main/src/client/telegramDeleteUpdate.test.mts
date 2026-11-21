/**
 * 离线单测：不需要 node_modules、不需要 Telegram 账号、不联网。
 *
 * 运行：
 *   node --experimental-strip-types main/src/client/telegramDeleteUpdate.test.mts
 */
import assert from 'node:assert/strict';
import { parseTelegramDeleteUpdate } from './telegramDeleteUpdate.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
};

// 用最小对象模拟 GramJS 的 TLObject。GramJS 的实例带 className getter，
// 这里只保留 className + 字段，正好也能验证解析器没有偷偷依赖 instanceof。
const channelDelete = (channelId: any, messages: any) => ({
  className: 'UpdateDeleteChannelMessages',
  channelId,
  messages,
  pts: 1,
  ptsCount: 1,
});
const plainDelete = (messages: any) => ({
  className: 'UpdateDeleteMessages',
  messages,
  pts: 1,
  ptsCount: 1,
});
// 模拟 big-integer 的 BigInteger（有 toString，非 number 类型）
const bigIntLike = (value: string) => ({ toString: () => value });

console.log('parseTelegramDeleteUpdate');

test('超级群删除：带 channelId，能定位转发对', () => {
  const event = parseTelegramDeleteUpdate(channelDelete(1234567890, [10, 11]) as any);
  assert.deepEqual(event, {
    chatId: 1234567890,
    messageIds: [10, 11],
    isPermanent: true,
    fromCache: false,
  });
});

test('超级群 channelId 是 BigInteger 时也能解析', () => {
  const event = parseTelegramDeleteUpdate(channelDelete(bigIntLike('1234567890'), [10]) as any);
  assert.equal(event?.chatId, 1234567890);
});

test('普通群删除：协议不给 chatId，返回 null 交给上层反查', () => {
  const event = parseTelegramDeleteUpdate(plainDelete([77]) as any);
  assert.deepEqual(event, {
    chatId: null,
    messageIds: [77],
    isPermanent: true,
    fromCache: false,
  });
});

test('消息 id 是 BigInteger 时转成 number', () => {
  const event = parseTelegramDeleteUpdate(plainDelete([bigIntLike('77'), bigIntLike('78')]) as any);
  assert.deepEqual(event?.messageIds, [77, 78]);
});

test('删除 id 去重', () => {
  const event = parseTelegramDeleteUpdate(plainDelete([5, 5, 6]) as any);
  assert.deepEqual(event?.messageIds, [5, 6]);
});

test('过滤非法 id（0 / 负数 / NaN / 非数字字符串）', () => {
  const event = parseTelegramDeleteUpdate(plainDelete([0, -3, 'abc', null, undefined, 9]) as any);
  assert.deepEqual(event?.messageIds, [9]);
});

test('超出安全整数范围的 id 会被丢弃（宁可漏也不能撤回错消息）', () => {
  const event = parseTelegramDeleteUpdate(plainDelete(['9007199254740993']) as any);
  assert.equal(event, null);
});

test('messages 为空数组 / 非数组时返回 null', () => {
  assert.equal(parseTelegramDeleteUpdate(plainDelete([]) as any), null);
  assert.equal(parseTelegramDeleteUpdate(plainDelete(undefined) as any), null);
  assert.equal(parseTelegramDeleteUpdate(plainDelete('nope') as any), null);
});

test('频道更新缺 channelId 时丢弃，避免误撤回', () => {
  assert.equal(parseTelegramDeleteUpdate(channelDelete(undefined, [1]) as any), null);
  assert.equal(parseTelegramDeleteUpdate(channelDelete(0, [1]) as any), null);
});

test('无关更新返回 null', () => {
  assert.equal(parseTelegramDeleteUpdate({ className: 'UpdateNewMessage' } as any), null);
  assert.equal(parseTelegramDeleteUpdate({ className: 'UpdateEditChannelMessage' } as any), null);
  assert.equal(parseTelegramDeleteUpdate(null), null);
  assert.equal(parseTelegramDeleteUpdate(undefined), null);
});

// 顺带守护一下 tdlib 那边的 id 约定，避免以后改坏（纯算术，不 import）
console.log('tdlib chatId 约定');
const tdlibChatIdToBotApi = (chatId: bigint) => {
  if (chatId >= 0n) return Number(chatId);
  const abs = -chatId;
  const OFFSET = 1000000000000n;
  return abs > OFFSET ? Number(abs - OFFSET) : Number(abs);
};
test('超群 -100 前缀去掉后等于 GramJS 裸 channelId', () => {
  assert.equal(tdlibChatIdToBotApi(-1001234567890n), 1234567890);
});
test('普通群 -id 取绝对值', () => {
  assert.equal(tdlibChatIdToBotApi(-98765n), 98765);
});

console.log(`\n${passed} passed${process.exitCode ? ' (有失败)' : ''}`);
