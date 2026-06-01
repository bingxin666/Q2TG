import { defineComponent, PropType } from 'vue';
import MessageElement from './MessageElement';
import styles from './Bubble.module.sass';
import { NTime } from 'naive-ui';
import type { ForwardMessage } from '../types/QQTypes';

export default defineComponent({
  props: {
    message: { required: true, type: Object as PropType<ForwardMessage> },
  },
  setup(props) {
    return () => <div class={styles.container}>
      {props.message.message.map((i, k) => <MessageElement elem={i} key={k}/>)}
      <div class={styles.time}>
        <NTime
          time={(props.message.time) * 1000}
          format="HH:mm"
        />
      </div>
    </div>;
  },
});
