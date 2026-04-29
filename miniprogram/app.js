App({
  globalData: {
    envId: "cloud1-d6gr30uhb9c86a169",
    user: null,
    familyId: ""
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showToast({ title: "请使用新版微信开发者工具", icon: "none" });
      return;
    }

    wx.cloud.init({
      env: this.globalData.envId || undefined,
      traceUser: true
    });
  }
});
