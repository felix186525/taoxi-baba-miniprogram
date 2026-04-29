const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const now = db.serverDate();

  const userQuery = await db.collection("users").where({ openid: OPENID }).limit(1).get();
  let user = userQuery.data[0];

  if (!user) {
    const userAdd = await db.collection("users").add({
      data: {
        openid: OPENID,
        nickName: "家庭成员",
        createdAt: now,
        updatedAt: now
      }
    });
    user = { _id: userAdd._id, openid: OPENID, nickName: "家庭成员" };
  }

  if (user.currentFamilyId) {
    const joinedFamily = await db.collection("families").doc(user.currentFamilyId).get();
    if (joinedFamily.data.memberOpenids.includes(OPENID)) {
      return {
        user,
        familyId: joinedFamily.data._id
      };
    }
  }

  const familyQuery = await db.collection("families").where({
    ownerOpenid: OPENID
  }).limit(1).get();

  let family = familyQuery.data[0];
  if (!family) {
    const familyAdd = await db.collection("families").add({
      data: {
        name: "淘熙家的账本",
        ownerOpenid: OPENID,
        memberOpenids: [OPENID],
        createdAt: now,
        updatedAt: now
      }
    });
    family = { _id: familyAdd._id, name: "淘熙家的账本" };
  }

  await db.collection("users").doc(user._id).update({
    data: {
      currentFamilyId: family._id,
      updatedAt: now
    }
  });

  return {
    user,
    familyId: family._id
  };
};
