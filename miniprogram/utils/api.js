const BASE_URL = "http://139.224.225.188/taoxi-baba/api";

function request(options) {
  const token = wx.getStorageSync("token");
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(res.data || { message: "request failed" });
      },
      fail: reject
    });
  });
}

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const data = await request({
            url: "/auth/wechat-login",
            method: "POST",
            data: { code: res.code }
          });
          wx.setStorageSync("token", data.token);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  login,
  request
};
