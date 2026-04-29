# 淘熙粑粑微信小程序

家庭账单管理小程序，第一版上线方案为微信原生小程序 + 微信云开发。

## 已包含功能

- 微信云开发登录，自动获取用户 `openid`
- 自动创建个人家庭账本
- 记录收入、支出账单
- 编辑和删除账单
- 首页展示本月收入、支出、结余
- 统计页展示本月分类支出
- 家庭页展示家庭账本信息
- 家庭成员通过家庭 ID 申请加入，创建者审核通过/拒绝
- 设置月度预算，统计页展示预算进度和超支提醒

## 导入项目

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本目录：

   `/Users/admin/Desktop/codextest/taoxi-baba-miniprogram`

4. AppID 使用：

   `wx7b15df0f163b627b`

## 开通云开发

1. 打开微信开发者工具，导入本项目。
2. 顶部点击“云开发”。
3. 创建一个云开发环境。
4. 复制环境 ID。
5. 打开 `miniprogram/app.js`，把 `globalData.envId` 改成你的环境 ID。

示例：

```js
globalData: {
  envId: "你的云开发环境ID",
  user: null,
  familyId: ""
}
```

## 创建数据库集合

在云开发控制台的数据库里创建 4 个集合：

- `users`
- `families`
- `bills`
- `budgets`

第一版主要通过云函数读写数据库，集合权限可以先保持默认。正式上线前建议改为仅云函数可写，并根据业务再细化安全规则。

## 部署云函数

在微信开发者工具左侧找到 `cloudfunctions`，分别右键以下目录并选择“上传并部署：云端安装依赖”：

- `login`
- `families`
- `bills`
- `budgets`

部署后点击“编译”，即可开始试用。

## 阿里云后端备用方案

后端目录在 `backend/`，当前线上服务由 systemd 启动：

`taoxi-baba-api.service`

默认 API 地址：

`http://139.224.225.188/taoxi-baba/api`

健康检查：

`http://139.224.225.188/taoxi-baba/health`

后端使用 SQLite，数据库默认路径：

`/opt/taoxi-baba/data/taoxi-baba.sqlite3`

如果后续你有备案域名和 HTTPS，可以切回阿里云后端。正式微信登录需要在服务器 `/opt/taoxi-baba/.env` 配置：

```bash
WECHAT_APP_ID=wx7b15df0f163b627b
WECHAT_APP_SECRET=你的微信小程序AppSecret
JWT_SECRET=换成一段随机长字符串
DB_PATH=/opt/taoxi-baba/data/taoxi-baba.sqlite3
```

## 本地运行备用后端

```bash
cd backend
python3 app/server.py
```

当前小程序页面默认调用微信云函数，不会请求阿里云 IP。

## 下一步建议

- 增加按孩子、成员、标签统计
- 增加账单导出
- 接入正式 logo 和小程序头像
