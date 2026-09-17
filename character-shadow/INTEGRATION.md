# 接入说明

要 `new` 的是 **`CharacterShadowAdapter`**（接入层）：它只管「**什么时候**画、
**哪些东西**进来、挂宿主哪些钩子」。「怎么画、怎么乘到材质上」在 `CharacterShadow`，
那部分已被 43 项自检 + 三组回归读数钉死。

适配层的形状取决于宿主，所以下面几处的**位置**比**代码**重要 ——
代码都是一行。

---

## 一、接线总量：5 处，其中 3 处各一行

| # | 挂在哪 | 加什么 |
| --- | --- | --- |
| 1 | 主渲染之前（合成器最前面，或朴素路径的 `renderer.render()` 之前） | `adapter.update()` |
| 2 | 地形区块流式管理器的刷新回调（那个已经在给 `renderer.shadowMap.needsUpdate` 置位的回调） | 同一回调里加 `adapter.markWorldDirty()` |
| 3 | 角色模型加载完成处 | `adapter.attachCharacter(avatarRoot)` |
| 4 | 启动装配处 | `adapter.attachScene(scene)` —— 一次性；后来的 chunk 靠 #2 补 |
| 5 | 太阳/天空更新 | **什么都不用加**（见第二节） |

```js
import { CharacterShadowAdapter } from './lighting/shadow/CharacterShadowAdapter.js';

const adapter = new CharacterShadowAdapter({
  renderer, scene,
  sun: skySunLight,     // ← 那盏带阴影盒的平行光，天空系统每轮改它的 position
  radius: 4.7,          // 软度：对齐 2048² 罩 300m 那一档的半影 14.6cm（见第四节）
});

adapter.attachScene(scene);
// 角色加载完成后：
adapter.attachCharacter(avatarRoot);

// 已有的区块刷新钩子里加一行：
const world = createWorld(scene, () => {
  renderer.shadowMap.needsUpdate = true;
  adapter.markWorldDirty();          // ★ 新增
});

function frame(dt) {
  …宿主自己的更新（角色位移在这一步算完）…
  adapter.update();                  // ★ 主渲染之前
  renderer.render(scene, camera);    //   或 composer.render(dt)
}
```

构造函数全部可选项：`{ renderer, scene, sun=null, sunDirection=null, size=256,
extent=4, radius=4.7, bias=0.024, maxShadowLength=25 }`。
`sun` 和 `sunDirection` 给一个就行（都给的话 `sunDirection` 优先）。

---

## 二、为什么太阳那处**不用动**

那盏灯的 `target` 是默认值（在原点），所以光方向就是 `-position` 归一化。
适配层 `update()` 里每帧做一次 `deriveSunDirection(sun)`，宿主一行接完。

**所以不要去改天空系统**，也不要在天空更新处调 `setSunDirection()`。理由不是省事：

- 少一处必须和天空更新同序的调用（漏一帧就影子朝旧太阳，
  而且 near/far 是按方向算的，会一起错）
- 方向来源只有一个 —— 反推。**这也就意味着灯的 `target` 不能被挪走**；
  万一哪天给 `sun.target` 赋了值，`deriveSunDirection` 会自动改走
  `target - position`，仍然对。

---

## 三、接完必须看的三个读数

`adapter.stats()`：

| 字段 | 期望 | 不是这样意味着 |
| --- | --- | --- |
| `skipped` | `{}`（空） | 有材质没进注入 —— 那类地面上**永远不会有**角色影子，且不报错。这是接入后最难查的故障，所以它按材质类型记数而不是静默跳过 |
| `attached` | `true` | 角色加载后没调到 `attachCharacter()` |
| `injected` | 随流式加载单调增长，不重复计数 | 卡住 = `markWorldDirty()` 没挂上；暴涨 = 每帧都在重注入 |

`adapter.probe().count > 0` —— 图里真的有角色。**别用截图判断「影子有没有」**，
一张 256² 的深度图在画面上只有几十个像素宽，肉眼和「阴影没生效」分不开。

```js
// 接线期建议临时挂一个：
setInterval(() => console.log(JSON.stringify(adapter.stats())), 2000);
// → {"attached":true,"injected":37,"skipped":{},"updates":812,
//    "texelWorldSize":0.015625,"penumbraWorldSize":0.1469,
//    "shadowTipDepth":0.682,"depthRange":[1.05,23.23],"sunDirection":[…]}
//
// texelWorldSize 应恒为 extent/size = 4/256 = 0.015625 m（1.56 cm）。
// 如果它不是这个数，说明 size/extent 被改过。
```

---

## 四、软度（接之前唯一必须定的一项）

半影 = **场景阴影图的纹素边长**（平行光的 `PCFSoftShadowMap` 只在一个纹素宽上重建，
`shadow.radius` 在那个分支不生效）。所以专用图的软度没有「正确值」，
只有「**叠在哪个方案上**」：

| 叠在 | 周围影子的半影 | 该用 `radius` | 实测过渡 |
| --- | --- | --- | --- |
| 单张基线图（2048² 罩 300 m） | 14.6 cm | **4.7** | 14.69 cm |
| CSM 级联 0（2048² 罩 114 m） | 5.5 cm | 1.75 | 5.47 cm |

换别的配置按这个公式算：`radius ≈ 场景半影宽度 / 专用图纹素边长`，
专用图纹素边长 = `extent / size`（默认 4 m / 256 = 1.56 cm）。

**用错会看得出来**：`radius` 偏大，角色的影子比周围**糊**一截；偏小则是**锐**一截。
两种都能一眼分辨，所以先按公式算，再目视微调。

对齐宽度 ≠ 观感一样，接之前要有预期：原状的影子**又淡又不匀**
（影内深度 21.3%，影尖那段只有 15.8%），专用图是实心均匀的 25.3%、面积还大 41%。
**换上去影子会明显更"实"**。对比图见 [README](README.md) 第一节。

---

## 五、已知坑（都是实现时踩到的，不是推测）

1. **角色不能重新挂父节点。** 如果宿主角色挂在被浮动原点平移过的组下
   （场景坐标 = 玩家 − 原点），把它 move 进任何包装组都会连坐标一起改，
   角色瞬间跳出一格、掉出 4 m 的正交盒、整张图被清成白。
   ⇒ 换人走 `setCharacter()` 换引用，**不动场景图**。

2. **换模型/换皮肤必须复用同一个 `CharacterShadow` 实例。**
   已注入材质的 `charShadowMap` uniform 在编译期就绑到了 `rt.depthTexture` 上；
   重建一个实例会让所有老材质继续采样**旧图**（影子停在换模型那一刻不动，或全亮）。
   `attachCharacter()` 内部已经是复用路径，宿主不要自己 `new`。

3. **`attachScene()` 之后、角色加载完之前**，地面材质已经在采样这张图了。
   所以构造期会先清一次成「全远」（全亮）。**清不掉**的话那段时间读到未定义内容
   （实测全 0）⇒ `z - bias <= stored` 基本不成立 ⇒ **整片地面被判定全在阴影里，黑掉**。
   角色若是异步加载的，这个窗口真实存在。

4. **`castShadow` 两边都开会叠成双影**（一张粗一张细）。专用图要求角色从场景那张图
   退场，`attachCharacter()` 会关掉它。

5. **图层 2 必须空着。** 专用相机 `cam.layers.set(2)`，角色是 `layers.enable(2)`
   （**并集**，不是替换）—— 否则主相机（只认图层 0）就看不见角色了。

6. **不要每帧 `scene.traverse()`。** 流式开放世界里 O(n) 每帧不划算。
   只在 `markWorldDirty()` 标脏后的**下一帧**补一次遍历。

7. **换 `roughnessMap` 之类的贴图不需要重新注入**（材质对象没变，
   `onBeforeCompile` 还在）。只有**新建材质**才需要 `markWorldDirty()`。

8. **VR**：`renderer.xr.isPresenting` 时 `update()` 直接跳过 —— 多跑一趟
   `renderer.render()` 会打乱 XR 的 framebuffer 绑定。代价是 VR 里角色没影子
   （它是「没有」，不是「错位」）。**这条要在真机 VR 上确认。**

9. **乘子只乘平行光那一份 —— 宿主有点光就会踩。** 注入点
   `lights_fragment_end` 里的 `reflectedLight.directDiffuse` 是**所有直射光之和**。
   街灯那种「强度高、不投影」的 `PointLight` 是最容易踩的形状：
   场景阴影图里没有它的影子，于是乘子成了唯一在减它的东西 ⇒ **灯下那块地面被压暗**。

   这一版已改成 `非平行光份额 + 平行光份额 × cs`，只乘平行光。
   **宿主若有自建的点光/聚光，接之前先按 [DEBUGGING.md](DEBUGGING.md) 第二节
   做一次夜间目视检查。** 自检里也有 4 条对着注入后 GLSL 源码的断言防它被改回去。

   > 附带一条别当 bug 修的现象：**角色站在街灯下就是没有街灯的影子**。
   > 灯不投影，角色的 `castShadow` 又被 `attachCharacter()` 关掉了，
   > 所以它夜里只剩月光那一份极淡的影子。这是设计形状，不是丢了一层。

---

## 六、公开 API 一览

`CharacterShadowAdapter`：

| 成员 | 用途 |
| --- | --- |
| `attachCharacter(root, { keepReceive = true })` | 挂角色，关它的 `castShadow`，加图层 2 |
| `detachCharacter()` | 摘角色（影子立刻从图里消失） |
| `attachScene(root = this.scene)` | 遍历一次、注入所有接收面 |
| `markWorldDirty()` | 标脏，下一帧补一次遍历（流式新地块用） |
| `injectMaterial(m)` | 手工注入单个材质（返回是否首次注入） |
| `update()` | 每帧调，主渲染之前 |
| `followSun(light)` / `setSunDirection(v)` | 换太阳 / 直接给方向 |
| `setRadius(v)` | 改软度 |
| `probe()` | 回读专用图，`{ count, ... }` —— 图里有多少像素是角色 |
| `stats()` | `{ attached, injected, skipped, updates, texelWorldSize, penumbraWorldSize, shadowTipDepth, depthRange, sunDirection }` |
| `visible` | getter/setter。`false` 时不再把角色画进图（乘子变恒等），角色本身在主画面里照常可见 |
| `dispose()` | 释放 RT / 相机 |
| 只读 getter | `radius` `size` `extent` `charCenter` `penumbraWorldSize` `texelWorldSize` `shadowTipDepth` `depthRange` |

具名导出：`deriveSunDirection(light, out)`、常量 `LIVE_RADIUS = 4.7`（`radius` 的默认值）。
