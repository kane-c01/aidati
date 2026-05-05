Component({
  options: { addGlobalClass: true },
  properties: {
    score: { type: Number, value: 0 },
    max: { type: Number, value: 100 },
    suffix: { type: String, value: '分' },
  },
  data: {
    percent: 0,
  },
  observers: {
    'score,max'(score: number, max: number) {
      const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;
      this.setData({ percent: Math.round(pct) });
    },
  },
});
