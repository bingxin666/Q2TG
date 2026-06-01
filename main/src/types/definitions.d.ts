import { MessageRet } from './qq-types';

export type WorkMode = 'group' | 'personal';
export type QQMessageSent = MessageRet & { senderId: number, brief: string };
