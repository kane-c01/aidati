Component({
  data: {
    height: 0,
  },

  lifetimes: {
    attached() {
      try {
        const win = wx.getWindowInfo();
        this.setData({ height: win.safeArea ? win.screenHeight - win.safeArea.bottom : 0 });
      } catch (err) {
        console.warn('[safe-area-bottom] window info failed', err);
      }
    },
  },
});
