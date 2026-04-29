const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (action === "list") {
    await assertFamilyMember(event.familyId, OPENID);
    return listBills(event.familyId, event.month);
  }

  if (action === "create") {
    const bill = event.bill;
    await assertFamilyMember(bill.familyId, OPENID);
    return createBill(bill, OPENID);
  }

  if (action === "detail") {
    await assertFamilyMember(event.familyId, OPENID);
    return getBill(event.id, event.familyId);
  }

  if (action === "update") {
    const bill = event.bill;
    await assertFamilyMember(bill.familyId, OPENID);
    return updateBill(event.id, bill, OPENID);
  }

  if (action === "delete") {
    await assertFamilyMember(event.familyId, OPENID);
    return deleteBill(event.id, event.familyId);
  }

  if (action === "stats") {
    await assertFamilyMember(event.familyId, OPENID);
    return getStats(event.familyId, event.month);
  }

  throw new Error("Unsupported action");
};

async function assertFamilyMember(familyId, openid) {
  const family = await db.collection("families").doc(familyId).get();
  if (!family.data.memberOpenids.includes(openid)) {
    throw new Error("No permission");
  }
}

async function listBills(familyId, month) {
  const query = await db.collection("bills")
    .where({ familyId, month })
    .orderBy("date", "desc")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const bills = query.data;
  return {
    bills,
    summary: summarize(bills)
  };
}

async function createBill(bill, openid) {
  const safeBill = normalizeBill(bill, openid);
  return db.collection("bills").add({ data: safeBill });
}

async function getBill(id, familyId) {
  const bill = await db.collection("bills").doc(id).get();
  if (bill.data.familyId !== familyId) {
    throw new Error("No permission");
  }
  return { bill: bill.data };
}

async function updateBill(id, bill, openid) {
  const current = await db.collection("bills").doc(id).get();
  if (current.data.familyId !== bill.familyId) {
    throw new Error("No permission");
  }

  const safeBill = normalizeBill(bill, openid);
  delete safeBill.createdAt;
  return db.collection("bills").doc(id).update({ data: safeBill });
}

async function deleteBill(id, familyId) {
  const current = await db.collection("bills").doc(id).get();
  if (current.data.familyId !== familyId) {
    throw new Error("No permission");
  }
  return db.collection("bills").doc(id).remove();
}

function normalizeBill(bill, openid) {
  const safeBill = {
    familyId: bill.familyId,
    type: bill.type === "income" ? "income" : "expense",
    category: String(bill.category || "其他").slice(0, 20),
    amount: Number(bill.amount),
    note: String(bill.note || "").slice(0, 100),
    date: bill.date,
    month: bill.month,
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  if (!safeBill.amount || safeBill.amount <= 0) {
    throw new Error("Invalid amount");
  }

  return safeBill;
}

async function getStats(familyId, month) {
  const query = await db.collection("bills")
    .where({
      familyId,
      month,
      type: _.in(["income", "expense"])
    })
    .limit(1000)
    .get();

  const bills = query.data;
  const categoryMap = {};
  bills
    .filter((bill) => bill.type === "expense")
    .forEach((bill) => {
      const category = bill.category || "其他";
      if (!categoryMap[category]) {
        categoryMap[category] = { category, amount: 0, count: 0 };
      }
      categoryMap[category].amount += Number(bill.amount || 0);
      categoryMap[category].count += 1;
    });

  const categories = Object.values(categoryMap)
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      amount: item.amount.toFixed(2)
    }));

  const budgetQuery = await db.collection("budgets")
    .where({ familyId, month })
    .limit(1)
    .get();
  const budgetAmount = Number((budgetQuery.data[0] || {}).amount || 0);
  const summary = summarize(bills);

  return {
    summary,
    budget: buildBudget(summary, budgetAmount),
    categories
  };
}

function summarize(bills) {
  const totals = bills.reduce((acc, bill) => {
    const amount = Number(bill.amount || 0);
    if (bill.type === "income") {
      acc.income += amount;
    } else {
      acc.expense += amount;
    }
    return acc;
  }, { income: 0, expense: 0 });

  return {
    income: totals.income.toFixed(2),
    expense: totals.expense.toFixed(2),
    balance: (totals.income - totals.expense).toFixed(2)
  };
}

function buildBudget(summary, amount) {
  const expense = Number(summary.expense || 0);
  const percent = amount > 0 ? Math.min(Math.round((expense / amount) * 100), 999) : 0;
  return {
    amount: amount.toFixed(2),
    remaining: (amount - expense).toFixed(2),
    percent,
    hasBudget: amount > 0,
    isOver: amount > 0 && expense > amount
  };
}
