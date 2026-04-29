const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (action === "detail") {
    const family = await getFamily(event.familyId, OPENID);
    return { family: decorateFamily(family, OPENID) };
  }

  if (action === "requestJoin") {
    return requestJoin(event.familyId, OPENID);
  }

  if (action === "approveJoin") {
    return approveJoin(event.familyId, event.openid, OPENID);
  }

  if (action === "rejectJoin") {
    return rejectJoin(event.familyId, event.openid, OPENID);
  }

  throw new Error("Unsupported action");
};

async function getFamily(familyId, openid) {
  const family = await db.collection("families").doc(familyId).get();
  const canView = family.data.memberOpenids.includes(openid) || family.data.ownerOpenid === openid;
  if (!canView) {
    throw new Error("No permission");
  }
  return family.data;
}

function decorateFamily(family, openid) {
  const pendingMembers = family.pendingMembers || [];
  return {
    ...family,
    isOwner: family.ownerOpenid === openid,
    memberCount: (family.memberOpenids || []).length,
    pendingMembers: family.ownerOpenid === openid ? pendingMembers : []
  };
}

async function requestJoin(familyId, openid) {
  const family = await db.collection("families").doc(familyId).get();
  const memberOpenids = family.data.memberOpenids || [];
  const pendingMembers = family.data.pendingMembers || [];

  if (memberOpenids.includes(openid)) {
    return { status: "already_member" };
  }

  if (pendingMembers.some((member) => member.openid === openid)) {
    return { status: "pending" };
  }

  await db.collection("families").doc(familyId).update({
    data: {
      pendingMembers: _.push([{
        openid,
        requestedAt: db.serverDate()
      }]),
      updatedAt: db.serverDate()
    }
  });

  return { status: "pending" };
}

async function approveJoin(familyId, targetOpenid, ownerOpenid) {
  const family = await db.collection("families").doc(familyId).get();
  if (family.data.ownerOpenid !== ownerOpenid) {
    throw new Error("Only owner can approve");
  }

  const pendingMembers = (family.data.pendingMembers || []).filter((member) => member.openid !== targetOpenid);
  const memberOpenids = family.data.memberOpenids || [];
  const nextMembers = memberOpenids.includes(targetOpenid)
    ? memberOpenids
    : memberOpenids.concat(targetOpenid);

  await db.collection("families").doc(familyId).update({
    data: {
      memberOpenids: nextMembers,
      pendingMembers,
      updatedAt: db.serverDate()
    }
  });

  const userQuery = await db.collection("users").where({ openid: targetOpenid }).limit(1).get();
  if (userQuery.data[0]) {
    await db.collection("users").doc(userQuery.data[0]._id).update({
      data: {
        currentFamilyId: familyId,
        updatedAt: db.serverDate()
      }
    });
  }

  return { status: "approved" };
}

async function rejectJoin(familyId, targetOpenid, ownerOpenid) {
  const family = await db.collection("families").doc(familyId).get();
  if (family.data.ownerOpenid !== ownerOpenid) {
    throw new Error("Only owner can reject");
  }

  await db.collection("families").doc(familyId).update({
    data: {
      pendingMembers: (family.data.pendingMembers || []).filter((member) => member.openid !== targetOpenid),
      updatedAt: db.serverDate()
    }
  });

  return { status: "rejected" };
}
