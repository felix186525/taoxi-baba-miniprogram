const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  await assertFamilyMember(event.familyId, OPENID);

  if (action === "set") {
    return setBudget(event.familyId, event.month, event.amount);
  }

  if (action === "get") {
    return getBudget(event.familyId, event.month);
  }

  throw new Error("Unsupported action");
};

async function assertFamilyMember(familyId, openid) {
  const family = await db.collection("families").doc(familyId).get();
  if (!family.data.memberOpenids.includes(openid)) {
    throw new Error("No permission");
  }
}

async function getBudget(familyId, month) {
  const query = await db.collection("budgets").where({ familyId, month }).limit(1).get();
  return { budget: query.data[0] || null };
}

async function setBudget(familyId, month, amount) {
  const value = Number(amount);
  if (Number.isNaN(value) || value < 0) {
    throw new Error("Invalid budget amount");
  }

  const query = await db.collection("budgets").where({ familyId, month }).limit(1).get();
  const data = {
    familyId,
    month,
    amount: value,
    updatedAt: db.serverDate()
  };

  if (query.data[0]) {
    await db.collection("budgets").doc(query.data[0]._id).update({ data });
    return { status: "updated" };
  }

  await db.collection("budgets").add({
    data: {
      ...data,
      createdAt: db.serverDate()
    }
  });

  return { status: "created" };
}
