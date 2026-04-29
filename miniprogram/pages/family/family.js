const app = getApp();

Page({
  data: {
    user: null,
    family: {
      pendingMembers: []
    },
    joinFamilyId: ""
  },

  onShow() {
    this.loadFamily();
  },

  async loadFamily() {
    if (!app.globalData.familyId) {
      const { result } = await wx.cloud.callFunction({ name: "login" });
      app.globalData.user = result.user;
      app.globalData.familyId = result.familyId;
    }

    const { result } = await wx.cloud.callFunction({
      name: "families",
      data: {
        action: "detail",
        familyId: app.globalData.familyId
      }
    });

    this.setData({
      user: app.globalData.user,
      family: {
        pendingMembers: [],
        ...result.family
      }
    });
  },

  copyFamilyId() {
    if (!this.data.family) return;
    wx.setClipboardData({
      data: this.data.family._id,
      success: () => wx.showToast({ title: "家庭ID已复制", icon: "success" })
    });
  },

  onJoinFamilyInput(event) {
    this.setData({ joinFamilyId: event.detail.value.trim() });
  },

  async requestJoinFamily() {
    if (!this.data.joinFamilyId) {
      wx.showToast({ title: "请输入家庭ID", icon: "none" });
      return;
    }

    wx.showLoading({ title: "申请中" });
    try {
      const { result } = await wx.cloud.callFunction({
        name: "families",
        data: {
          action: "requestJoin",
          familyId: this.data.joinFamilyId
        }
      });
      wx.hideLoading();
      const title = result.status === "already_member" ? "你已在该家庭" : "已提交申请";
      wx.showToast({ title, icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: "申请失败，请检查家庭ID", icon: "none" });
    }
  },

  approveJoin(event) {
    this.reviewJoin(event.currentTarget.dataset.openid, "approveJoin");
  },

  rejectJoin(event) {
    this.reviewJoin(event.currentTarget.dataset.openid, "rejectJoin");
  },

  async reviewJoin(openid, action) {
    wx.showLoading({ title: "处理中" });
    try {
      await wx.cloud.callFunction({
        name: "families",
        data: {
          action,
          familyId: this.data.family._id,
          openid
        }
      });
      wx.hideLoading();
      wx.showToast({ title: action === "approveJoin" ? "已通过" : "已拒绝", icon: "success" });
      this.loadFamily();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: "处理失败", icon: "none" });
    }
  }
});
