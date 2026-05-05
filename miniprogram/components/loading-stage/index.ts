Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: 'AI 正在认真出题中...' },
    hint: { type: String, value: '通常 30 秒内完成' },
    progress: { type: Number, value: 0 },
  },
});
