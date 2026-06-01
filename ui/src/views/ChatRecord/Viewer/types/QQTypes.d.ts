/**
 * Local type definitions for QQ message types.
 * Replaces @icqqjs/icqq dependency for the UI package.
 */

/** Basic message element types used in the viewer */
export type MessageElem =
  | { type: 'text'; text: string }
  | { type: 'image'; file: string; url?: string }
  | { type: 'face'; id: number; text?: string }
  | { type: 'at'; qq: number | string; text?: string }
  | { type: 'record'; file: string; url?: string }
  | { type: 'video'; file: string; url?: string }
  | { type: 'mface'; emojiId?: string; url?: string }
  | { type: 'json'; data: string }
  | { type: 'xml'; data: string }
  | { type: 'reply'; id: number | string }
  | { type: 'forward'; id: string }
  | { type: 'node'; user_id: number; nickname: string; message: MessageElem | MessageElem[] | string }
  | { type: string; [key: string]: any };

/** Forward message structure as returned by QQ API */
export interface ForwardMessage {
  /** Message ID */
  id?: string;
  /** Sender's user ID */
  user_id: number;
  /** Sender's nickname */
  nickname: string;
  /** Sender's avatar URL */
  avatar?: string;
  /** Message timestamp (seconds) */
  time: number;
  /** Message content elements */
  message: MessageElem[];
  /** Raw message string */
  raw_message?: string;
}
