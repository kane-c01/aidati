Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: '出错啦' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '重新加载' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
