const app = getApp();

Page({
  data: {
    month: "",
    summary: {
      income: 0,
      expense: 0,
      balance: 0
    },
    budget: {
      amount: "0.00",
      remaining: "0.00",
      percent: 0,
      hasBudget: false,
      isOver: false
    },
    budgetTip: "设置本月支出预算",
    budgetProgress: 0,
    budgetInput: "",
    categories: []
  },

  onShow() {
    this.setData({ month: this.currentMonth() });
    this.loadStats();
  },

  currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },

  async loadStats() {
    if (!app.globalData.familyId) {
      const { result } = await wx.cloud.callFunction({ name: "login" });
      app.globalData.user = result.user;
      app.globalData.familyId = result.familyId;
    }

    const { result } = await wx.cloud.callFunction({
      name: "bills",
      data: {
        action: "stats",
        familyId: app.globalData.familyId,
        month: this.data.month
      }
    });

    this.setData({
      summary: result.summary,
      budget: result.budget,
      budgetTip: this.formatBudgetTip(result.budget),
      budgetProgress: Math.min(result.budget.percent, 100),
      budgetInput: result.budget.hasBudget ? result.budget.amount : "",
      categories: result.categories
    });
  },

  formatBudgetTip(budget) {
    if (!budget.hasBudget) return "设置本月支出预算";
    return budget.isOver ? "已超出预算" : `剩余 ¥${budget.remaining}`;
  },

  onBudgetInput(event) {
    this.setData({ budgetInput: event.detail.value });
  },

  async saveBudget() {
    const amount = Number(this.data.budgetInput || 0);
    if (Number.isNaN(amount) || amount < 0) {
      wx.showToast({ title: "请输入有效预算", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中" });
    try {
      await wx.cloud.callFunction({
        name: "budgets",
        data: {
          action: "set",
          familyId: app.globalData.familyId,
          month: this.data.month,
          amount
        }
      });
      wx.hideLoading();
      wx.showToast({ title: "预算已保存", icon: "success" });
      this.loadStats();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  }
});
