Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    used: {
      type: Number,
      value: 0,
    },
    limit: {
      type: Number,
      value: 0,
    },
  },
  data: {
    remaining: 0,
    exhausted: false,
  },
  observers: {
    'used,limit'(used: number, limit: number) {
      const remaining = Math.max(0, limit - used);
      this.setData({
        remaining,
        exhausted: limit > 0 && remaining <= 0,
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
