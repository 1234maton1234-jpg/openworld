# openworld CLI

需要 Node.js 22.13+。在项目目录运行 `node cli/openworld.mjs`，或执行 `npm link` 后使用 `openworld`。

## 登录

默认使用浏览器 GitHub OAuth 授权，本地和线上均支持：

```powershell
node cli/openworld.mjs login --server http://127.0.0.1:8787
node cli/openworld.mjs whoami
```

运行 login 后自动打开浏览器，核对终端授权码，登录 GitHub 并确认授权；终端自动保存独立的 openworld 会话。请求 10 分钟过期，授权仅可领取一次。`--no-browser` 只输出授权链接，适合远程终端。CLI 不保存 GitHub Token。

备用方式：使用 `login --token`，准备自己的 GitHub Token（仅需要读取自己的 GitHub 用户身份，不需要仓库权限）：通过 `OPENWORLD_GITHUB_TOKEN` 环境变量或标准输入传入，然后运行 `login --server https://你的域名`。Token 会发送给指定站点用于向 GitHub 验证身份，服务器不保存它。请只对信任的站点登录。

CLI 将站点会话保存在用户目录 `.openworld/credentials.json`，七天到期。可用 `--config PATH` 或 `OPENWORLD_CLI_CONFIG` 指定独立会话文件；不会在输出中打印凭据。使用 `logout` 撤销会话并删除本地文件。非本机服务必须使用 HTTPS，跨站重定向会被拒绝。

## 三个模型操作

```powershell
# 1. 替换当前账号角色模型
node cli/openworld.mjs avatar set ./character.glb

# 2. 上传自己的地皮模型，仅保存草稿
node cli/openworld.mjs plot upload ./church.glb --title "圣曦教堂"

# 3. 使用上传结果中的 id 提交审核
node cli/openworld.mjs plot submit 上传返回的模型ID
```

提交审核不代表审核通过，管理员仍通过网页审核工作台发布。不能提交他人的草稿；同一账号最多一份待审核提交。已发布建筑不会被未审核模型覆盖。网页原有上传流程仍直接提交审核。

角色与网页登录账号须相同，网页约 15 秒内同步角色模型，按 O 切换第三人称查看。新角色须为带蒙皮骨架的 GLB，面朝 -Z、Y 向上，包含 idle、walk、run、sit、cycle 五组动作。最多 4 套蒙皮，每套最多 128 骨骼；所有网格须有有效权重，动作时长不超过 60 秒。宽深不超过 2 米，高 0.5～2.4 米，显示时缩放到 1.8 米。游戏切换动作并同步骑行相位；不同体型的握把与踏板接触需要制作者调姿。地皮建筑仍只接受静态 GLB。两类模型均限 12 MB、10 万三角面、512 节点、200 绘制单元，不支持外部资源、扩展或形变。

命令失败返回非零退出码；上传和提交结果输出 JSON。`--help` 查看命令。
