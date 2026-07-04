const TDLIB_MESSAGE_ID_SHIFT = 20n;

export const tdlibMessageIdToBotApi = (messageId: number | string | bigint) => {
  const id = BigInt(messageId);
  const result = id >> TDLIB_MESSAGE_ID_SHIFT;
  if ((result << TDLIB_MESSAGE_ID_SHIFT) !== id) return 0;
  return Number(result);
};

export const botApiMessageIdToTdlib = (messageId: number) =>
  (BigInt(messageId) << TDLIB_MESSAGE_ID_SHIFT).toString();
