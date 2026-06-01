/**
 * Local type definitions replacing @icqqjs/icqq types.
 * These types are compatible with the icqq/napcat type system
 * and used throughout the Q2TG codebase.
 */

import type { Readable } from 'node:stream';

// ============================================================================
// Message Element Types
// ============================================================================

/** Text message element */
export interface TextElem {
  type: 'text';
  text: string;
}

/** QQ face/emoji element */
export interface FaceElem {
  type: 'face';
  id: number;
  /** Text representation of the face */
  text?: string;
}

/** At/mention element */
export interface AtElem {
  type: 'at';
  text?: string;
  qq: number | string;
  id?: number;
}

/** Image message element */
export interface ImageElem {
  type: 'image';
  file: string | Buffer | Readable;
  /** Image URL (when received from server) */
  url?: string;
  /** Whether this is a face-style sticker */
  asface?: boolean;
  /** Brief description for the image */
  brief?: string;
  /** MD5 hash of the image */
  md5?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** File size in bytes */
  size?: number;
  /** Sub type (0=normal, 7=face sticker) */
  sub_type?: number;
  /** Summary text */
  summary?: string;
  /** Image name */
  name?: string;
}

/** Voice/audio message element (record) */
export interface PttElem {
  type: 'record';
  file: string | Buffer | Readable;
  /** Audio URL */
  url?: string;
  /** MD5 hash */
  md5?: string;
  /** File size in bytes */
  size?: number;
  /** Duration in seconds */
  duration?: number;
}

/** Video message element */
export interface VideoElem {
  type: 'video';
  file: string | Buffer | Readable;
  /** Video file ID */
  fid?: string;
  /** Video URL */
  url?: string;
  /** MD5 hash */
  md5?: string;
  /** File size in bytes */
  size?: number;
}

/** Dynamic face/sticker element (mface) */
export interface MfaceElem {
  type: 'mface';
  emojiId?: string;
  emojiPackageId?: number;
  key?: string;
  url?: string;
}

/** Forward message node */
export interface ForwardNode {
  type: 'node';
  user_id: number;
  nickname: string;
  message: MessageElem | MessageElem[] | string | (MessageElem | string)[];
}

/** Mirai metadata element */
export interface MiraiElem {
  type: 'mirai';
  data: string;
}

/** JSON/XML card element */
export interface JsonElem {
  type: 'json';
  data: string;
  /** Whether this is raw JSON */
  resid?: string;
}

/** Reply/quote element */
export interface ReplyElem {
  type: 'reply';
  id: number | string;
}

/** Dice element */
export interface DiceElem {
  type: 'dice';
  id: number;
}

/** Rock-paper-scissors element */
export interface RpsElem {
  type: 'rps';
  id: number;
}

/** File element */
export interface FileElem {
  type: 'file';
  file: string;
  fid?: string;
  name?: string;
  size?: number;
  md5?: string;
  duration?: number;
}

/** Markdown element */
export interface MarkdownElem {
  type: 'markdown';
  content: string;
}

/** XML element */
export interface XmlElem {
  type: 'xml';
  data: string;
}

/** Sface element */
export interface SfaceElem {
  type: 'sface';
  id: number;
  text?: string;
}

/** Big face/sticker element */
export interface BfaceElem {
  type: 'bface';
  id: number;
  text?: string;
  file?: string;
}

/** Flash/ephemeral photo element */
export interface FlashElem {
  type: 'flash';
  file: string;
  url?: string;
}

/** Share/link element */
export interface ShareElem {
  type: 'share';
  url: string;
  title?: string;
  content?: string;
  image?: string;
}

/** Poke element */
export interface PokeElem {
  type: 'poke';
  id: number;
  text?: string;
}

/** Forward element */
export interface ForwardElem {
  type: 'forward';
  id: string;
  content?: any[];
}

/**
 * Union of all message element types.
 * Used in message chains for both sending and receiving.
 */
export type MessageElem =
  | TextElem
  | FaceElem
  | ImageElem
  | AtElem
  | PttElem
  | VideoElem
  | MfaceElem
  | ForwardNode
  | MiraiElem
  | JsonElem
  | ReplyElem
  | DiceElem
  | RpsElem
  | FileElem
  | MarkdownElem
  | XmlElem
  | SfaceElem
  | BfaceElem
  | FlashElem
  | ShareElem
  | PokeElem
  | ForwardElem;

// ============================================================================
// Message Return & Quote Types
// ============================================================================

/** Return type when sending a message */
export interface MessageRet {
  /** Message ID as string */
  message_id: string;
  /** Message sequence number */
  seq: number;
  /** Timestamp */
  time: number;
  /** Random number for message identification */
  rand: number;
}

/** Quote/reply source information */
export interface Quotable {
  seq: number;
  rand: number;
  time: number;
  user_id: number;
  message?: MessageElem[] | string;
}

// ============================================================================
// Enum Types
// ============================================================================

/** User gender */
export type Gender = 'male' | 'female' | 'unknown';

/** Group member role */
export type GroupRole = 'member' | 'admin' | 'owner';

/** Login platform for QQ client */
export enum Platform {
  /** Android phone */
  Android = 1,
  /** Android tablet (aPad) */
  aPad = 2,
  /** Android watch */
  Watch = 3,
  /** macOS */
  iMac = 5,
  /** iPad */
  iPad = 6,
  /** WeChat (deprecated) */
  WeChat = 7,
}

// ============================================================================
// Request Event Types
// ============================================================================

/** Base interface for all request events (friend request, group invite, etc.) */
export interface RequestEvent {
  post_type: 'request';
  user_id: number;
  nickname: string;
  flag: string;
  time: number;
  seq: number;
  approve(yes?: boolean): Promise<boolean>;
}

/** Friend request event */
export interface FriendRequestEvent extends RequestEvent {
  request_type: 'friend';
  sub_type: 'add';
  source: string;
  comment: string;
  age: number;
  sex: Gender;
}

/** Group join request event */
export interface GroupRequestEvent extends RequestEvent {
  request_type: 'group';
  sub_type: 'add';
  group_id: number;
  group_name: string;
  comment: string;
  inviter_id: number;
  tips: string;
}

/** Group invite event */
export interface GroupInviteEvent extends RequestEvent {
  request_type: 'group';
  sub_type: 'invite';
  group_id: number;
  group_name: string;
  comment: string;
  role: GroupRole;
}

// ============================================================================
// Oicq-specific Types (used in instanceof checks, kept for compatibility)
// ============================================================================

/**
 * Member type from oicq, used in instanceof checks.
 * With NapCat-only mode, these checks always return false,
 * but the type is kept for code compatibility.
 */
export interface Member {
  readonly uin: number;
  readonly info: MemberInfo;
  readonly client: { uin: number };
}

/** Member info as returned by oicq */
export interface MemberInfo {
  user_id: number;
  nickname: string;
  card: string;
  sex: Gender;
  age: number;
  join_time: number;
  last_sent_time: number;
  role: GroupRole;
  title: string;
}

/**
 * Group type from oicq, used in instanceof checks.
 * See note on Member above.
 */
export interface OicqGroup {
  readonly gid: number;
  readonly info: {
    member_count: number;
    owner_id: number;
  };
  pickMember(uin: number, strict?: boolean): Member;
}

/**
 * Friend type from oicq, used in instanceof checks.
 * See note on Member above.
 */
export interface OicqFriend {
  readonly uin: number;
  readonly nickname: string;
  readonly remark: string;
}

/** User profile information */
export interface UserProfile {
  long_nick?: string;
  birthday?: number[];
  city?: string;
  country?: string;
  province?: string;
  gender?: Gender;
  age?: number;
  QID?: string;
  email?: string;
  regTimestamp?: number;
}

// ============================================================================
// Utility: segment (message construction helpers)
// ============================================================================

/**
 * Message segment construction helpers.
 * Provides a convenient way to create message elements.
 */
export const segment = {
  text(text: string): TextElem {
    return { type: 'text', text };
  },
  face(id: number): FaceElem {
    return { type: 'face', id };
  },
  image(file: string | Buffer | Readable): ImageElem {
    return { type: 'image', file };
  },
  at(qq: number | string, text?: string): AtElem {
    return { type: 'at', qq, text: text || `@${qq}` };
  },
  record(file: string | Buffer | Readable): PttElem {
    return { type: 'record', file };
  },
  video(file: string | Buffer | Readable): VideoElem {
    return { type: 'video', file };
  },
  json(data: string): JsonElem {
    return { type: 'json', data };
  },
  xml(data: string): XmlElem {
    return { type: 'xml', data };
  },
  reply(id: number | string): ReplyElem {
    return { type: 'reply', id };
  },
  node(user_id: number, nickname: string, message: ForwardNode['message']): ForwardNode {
    return { type: 'node', user_id, nickname, message };
  },
};
