import type { MessageElem } from './QQTypes';

export type MessageElemExt = MessageElem | {
  type: 'video-loop',
  url: string
} | {
  type: 'tgs',
  url: string
}
