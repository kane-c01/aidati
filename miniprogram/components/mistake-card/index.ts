import { formatRelative } from '../../utils/time';
import type { MistakeItem } from '../../types/domain';

Component({
  options: { addGlobalClass: true },
  properties: {
    mistake: {
      type: Object,
      value: null as MistakeItem | null,
    },
  },
  data: {
    lastWrongLabel: '',
  },
  observers: {
    mistake(m: MistakeItem | null) {
      this.setData({ lastWrongLabel: m ? formatRelative(m.last_wrong_at) : '' });
    },
  },
  methods: {
    onTap() {
      const m = this.properties.mistake as MistakeItem | null;
      if (!m) return;
      this.triggerEvent('tap', { id: m.id });
    },
  },
});
