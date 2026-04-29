App({
  globalData: {
    apiBaseUrl: "http://139.224.225.188/taoxi-baba/api",
    user: null,
    familyId: ""
  },

  onLaunch() {
    this.globalData.user = wx.getStorageSync("user") || null;
    this.globalData.familyId = wx.getStorageSync("familyId") || "";
  }
});
