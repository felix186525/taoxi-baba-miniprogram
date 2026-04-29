# 淘熙粑粑微信小程序

家庭账单管理小程序，技术方案为微信原生小程序 + 阿里云 Python 轻量后端。

## 已包含功能

- 微信登录，后端通过 `code2session` 获取用户 `openid`
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

## 阿里云后端

后端目录在 `backend/`，当前线上服务由 systemd 启动：

`taoxi-baba-api.service`

默认 API 地址：

`http://139.224.225.188/taoxi-baba/api`

健康检查：

`http://139.224.225.188/taoxi-baba/health`

后端使用 SQLite，数据库默认路径：

`/opt/taoxi-baba/data/taoxi-baba.sqlite3`

正式微信登录需要在服务器 `/opt/taoxi-baba/.env` 配置：

```bash
WECHAT_APP_ID=wx7b15df0f163b627b
WECHAT_APP_SECRET=你的微信小程序AppSecret
JWT_SECRET=换成一段随机长字符串
DB_PATH=/opt/taoxi-baba/data/taoxi-baba.sqlite3
```

如果暂时没有 `WECHAT_APP_SECRET`，后端会使用开发模式 openid，便于先调页面和接口；正式上线前必须补上真实 AppSecret。

## 微信小程序配置

开发者工具调试 HTTP/IP 接口时，需要在详情里勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

正式发布时，微信小程序要求 `request` 合法域名必须是已备案域名并启用 HTTPS，不能直接使用 IP 地址。需要把域名解析到 `139.224.225.188`，配置 SSL 证书，然后在微信公众平台配置服务器域名。

## 本地运行后端

```bash
cd backend
python3 app/server.py
```

## 云函数备份

`cloudfunctions/` 是早期微信云开发版本的备份，当前小程序页面已经改为调用阿里云后端 API。

## 下一步建议

- 增加按孩子、成员、标签统计
- 增加账单导出
- 接入正式 logo 和小程序头像
