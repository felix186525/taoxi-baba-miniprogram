const app = getApp();

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
    const { result } = await wx.cloud.callFunction({ name: "login" });
    app.globalData.user = result.user;
    app.globalData.familyId = result.familyId;
  },

  async loadBill(id) {
    await this.ensureFamily();
    const { result } = await wx.cloud.callFunction({
      name: "bills",
      data: {
        action: "detail",
        familyId: app.globalData.familyId,
        id
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
      await wx.cloud.callFunction({
        name: "bills",
        data: {
          action: this.data.id ? "update" : "create",
          id: this.data.id,
          bill: {
            familyId: app.globalData.familyId,
            type: this.data.type,
            category: this.data.categories[this.data.categoryIndex],
            amount,
            note: this.data.note.trim(),
            date: this.data.date,
            month: this.data.date.slice(0, 7)
          }
        }
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
          await wx.cloud.callFunction({
            name: "bills",
            data: {
              action: "delete",
              familyId: app.globalData.familyId,
              id: this.data.id
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
