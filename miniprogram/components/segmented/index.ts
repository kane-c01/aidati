interface Option {
  label: string;
  value: string;
}

Component({
  options: { addGlobalClass: true },
  properties: {
    options: {
      type: Array,
      value: [] as Option[],
    },
    value: {
      type: String,
      value: '',
    },
  },
  methods: {
    onSelect(e: WechatMiniprogram.BaseEvent) {
      const v = e.currentTarget.dataset.value as string;
      if (v === this.data.value) return;
      this.triggerEvent('change', { value: v });
    },
  },
});
