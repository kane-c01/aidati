interface Option {
  label: string;
  value: string;
  disabled?: boolean;
}

Component({
  options: { addGlobalClass: true },
  properties: {
    options: { type: Array, value: [] as Option[] },
    value: { type: Array, value: [] as string[] },
    multiple: { type: Boolean, value: true },
  },
  data: {
    activeMap: {} as Record<string, boolean>,
  },
  observers: {
    value(v: string[]) {
      const map: Record<string, boolean> = {};
      v.forEach((x) => (map[x] = true));
      this.setData({ activeMap: map });
    },
  },
  methods: {
    onTap(e: WechatMiniprogram.BaseEvent) {
      const v = e.currentTarget.dataset.value as string;
      const opt = (this.data.options as Option[]).find((o) => o.value === v);
      if (opt?.disabled) return;
      const current = (this.data.value as string[]).slice();
      if (this.data.multiple) {
        const idx = current.indexOf(v);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(v);
      } else {
        current.length = 0;
        current.push(v);
      }
      this.triggerEvent('change', { value: current });
    },
  },
});
