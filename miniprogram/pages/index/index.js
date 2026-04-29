const app = getApp();

const categories = ["餐饮", "购物", "交通", "教育", "医疗", "住房", "娱乐", "其他"];

Page({
  data: {
    loading: true,
    month: "",
    summary: {
      income: 0,
      expense: 0,
      balance: 0
    },
    bills: []
  },

  onShow() {
    this.bootstrap();
  },

  async bootstrap() {
    this.setData({ loading: true, month: this.currentMonth() });
    await this.ensureLogin();
    await this.loadBills();
  },

  currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },

  async ensureLogin() {
    if (app.globalData.user && app.globalData.familyId) return;
    const { result } = await wx.cloud.callFunction({ name: "login" });
    app.globalData.user = result.user;
    app.globalData.familyId = result.familyId;
  },

  async loadBills() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "bills",
        data: {
          action: "list",
          familyId: app.globalData.familyId,
          month: this.data.month
        }
      });

      this.setData({
        bills: result.bills.map(this.formatBill),
        summary: result.summary,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "账单加载失败", icon: "none" });
    }
  },

  formatBill(bill) {
    return {
      ...bill,
      amountText: Number(bill.amount || 0).toFixed(2),
      category: bill.category || categories[categories.length - 1],
      typeText: bill.type === "income" ? "收入" : "支出"
    };
  },

  goAddExpense() {
    wx.navigateTo({ url: "/pages/bill-edit/bill-edit?type=expense" });
  },

  goAddIncome() {
    wx.navigateTo({ url: "/pages/bill-edit/bill-edit?type=income" });
  },

  editBill(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/bill-edit/bill-edit?id=${id}` });
  }
});
