# 小龟烂梗助手

## 本地使用

1. 在相邻的 `主播烂梗档案馆-api` 目录启动 PostgreSQL 和 Fastify API。
2. 在本前端目录执行 `npm run dev`。
3. 打开 `http://127.0.0.1:3000/userscripts/nishuixiaogui-meme-helper.user.js` 并在 Tampermonkey 中安装。
4. 打开任意斗鱼直播间；普通首页和分类页面不会显示助手。

脚本默认连接 `http://127.0.0.1:4000`。需要切换时，点击 Tampermonkey 菜单中的“设置小龟助手服务地址”，无需修改源代码。

## 使用方式

- 点击“小龟烂梗”打开或收起面板。
- 按住悬浮按钮或面板黄色标题栏可以拖动，位置会自动保存。
- “本页隐藏”只隐藏当前页面；可从 Tampermonkey 菜单恢复。
- Tampermonkey 菜单可以重置助手位置；永久停用仍使用扩展自带的脚本开关。
- “一键发送”每次由用户主动触发，发送后有 3 秒本地冷却；单纯“填入”不触发冷却。

## 正式发布

- `@downloadURL` 和 `@updateURL` 已指向 `https://9765366.cn/userscripts/nishuixiaogui-meme-helper.user.js`，版本号升级后 Tampermonkey 会自动检查更新。
- 生产镜像会把脚本默认服务地址构建为 `https://9765366.cn`，接口路径仍使用 `/api`；源码继续保留本地默认值，方便开发。
- 在后端 `ALLOWED_ORIGINS` 中加入正式前端域名和斗鱼域名。
- 保留发送冷却，并根据真实访问量调整后端限流。
