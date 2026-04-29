const app = getApp();
const api = require("../../utils/api");

const categoryMap = {
  expense: ["餐饮", "购物", "交通", "教育", "医疗", "住房", "娱乐", "其他"],
  income: ["工资", "奖金", "红包", "报销", "理财", "其他"]
};

Page({
  data: {
    id: "",
    type: "expense",
    categories: categoryMap.expense,
    categoryIndex: 0,
    amount: "",
    note: "",
    date: ""
  },

  onLoad(options) {
    const type = options.type || "expense";
    this.setData({
      id: options.id || "",
      type,
      categories: categoryMap[type],
      date: this.today()
    });

    if (options.id) {
      this.loadBill(options.id);
    }
  },

  today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },

  switchType(event) {
    const type = event.currentTarget.dataset.type;
    this.setData({
      type,
      categories: categoryMap[type],
      categoryIndex: 0
    });
  },

  onCategoryChange(event) {
    this.setData({ categoryIndex: Number(event.detail.value) });
  },

  onDateChange(event) {
    this.setData({ date: event.detail.value });
  },

  onAmountInput(event) {
    this.setData({ amount: event.detail.value });
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value });
  },

  async ensureFamily() {
    if (app.globalData.familyId) return;
    const result = await api.login();
    app.globalData.user = result.user;
    app.globalData.familyId = result.familyId;
    wx.setStorageSync("user", result.user);
    wx.setStorageSync("familyId", result.familyId);
  },

  async loadBill(id) {
    await this.ensureFamily();
    const result = await api.request({
      url: `/bills/${id}`,
      data: {
        familyId: app.globalData.familyId
      }
    });

    const bill = result.bill;
    const type = bill.type === "income" ? "income" : "expense";
    const categories = categoryMap[type];
    const categoryIndex = Math.max(categories.indexOf(bill.category), 0);
    this.setData({
      type,
      categories,
      categoryIndex,
      amount: String(bill.amount || ""),
      note: bill.note || "",
      date: bill.date || this.today()
    });
  },

  async saveBill() {
    await this.ensureFamily();
    const amount = Number(this.data.amount);
    if (!amount || amount <= 0) {
      wx.showToast({ title: "请输入有效金额", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中" });
    try {
      const bill = {
        familyId: app.globalData.familyId,
        type: this.data.type,
        category: this.data.categories[this.data.categoryIndex],
        amount,
        note: this.data.note.trim(),
        date: this.data.date,
        month: this.data.date.slice(0, 7)
      };
      await api.request({
        url: this.data.id ? `/bills/${this.data.id}` : "/bills",
        method: this.data.id ? "PUT" : "POST",
        data: bill
      });
      wx.hideLoading();
      wx.navigateBack();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  deleteBill() {
    if (!this.data.id) return;
    wx.showModal({
      title: "删除账单",
      content: "确认删除这笔账单吗？",
      confirmColor: "#d6533c",
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "删除中" });
        try {
          await api.request({
            url: `/bills/${this.data.id}`,
            method: "DELETE",
            data: {
              familyId: app.globalData.familyId
            }
          });
          wx.hideLoading();
          wx.navigateBack();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  }
});
