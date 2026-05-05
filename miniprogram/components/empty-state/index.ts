Component({
  options: { addGlobalClass: true },
  properties: {
    emoji: { type: String, value: '' },
    title: { type: String, value: '空空如也' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
