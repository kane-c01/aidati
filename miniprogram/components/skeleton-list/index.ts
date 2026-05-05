Component({
  options: { addGlobalClass: true },
  properties: {
    count: { type: Number, value: 5 },
    withTags: { type: Boolean, value: true },
  },
  data: {
    rows: [] as number[],
  },
  observers: {
    count(n: number) {
      this.setData({ rows: Array.from({ length: Math.max(1, n) }, (_, i) => i) });
    },
  },
  lifetimes: {
    attached() {
      const n: number = this.data.count > 0 ? this.data.count : 5;
      this.setData({ rows: Array.from({ length: n }, (_, i) => i) });
    },
  },
});
