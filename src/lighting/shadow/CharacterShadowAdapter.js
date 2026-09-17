/**
 * 角色专用阴影图的**接入层**。
 *
 * `CharacterShadow` 管"怎么画这张图、怎么把它乘到材质上"；
 * 这一层管"**什么时候**画、**哪些东西**该进来、跟宿主引擎的哪些钩子对接"。
 * 分开是因为前者的正确性可以用测试台钉死，后者的形状取决于宿主。
 *
 * ── 它解决的宿主问题（都来自读线上 bundle 的实测，见 README）──────────
 *
 * 1. **太阳是动的**。线上那盏带 300m 阴影盒的平行光就是天空系统的 `sun`，
 *    每轮天空更新都会 `position.copy(...).multiplyScalar(65)`，夜里还换月亮方向，
 *    并且 `y = Math.max(5, y)` 把最低高度角夹在 4.4°。
 *    ⇒ 所以有 `followSun(light, ...)`：**每帧从光的位置反推方向**，宿主一行接完，
 *    不用去改天空系统（那盏灯的 `target` 是默认值即在原点，方向 = `-position`）。
 *
 * 2. **世界是流式加载的，材质在运行时不断新建**。地面/道路是按区块现造
 *    `MeshStandardMaterial`，天气还会换 `roughnessMap`。注入挂在材质的
 *    `onBeforeCompile` 上，构造期遍历一次够不到后来的 chunk。
 *    ⇒ 所以有 `attachScene()` / `markWorldDirty()`：宿主在世界变化时标一下脏，
 *    **下一帧补一次遍历**。不做成"每帧遍历整个场景"—— 线上是流式开放世界，
 *    每帧 `scene.traverse()` 是 O(n)。
 *
 * 3. **默认渲染路径是朴素的 `renderer.render()`，赛博朋克画风下走 6 pass 合成器**。
 *    两条路都汇进同一个 `render()` 方法 ⇒ `update()` 必须在**那次主渲染之前**调。
 *
 * 4. **WebXR**：线上有 XR 管理器，`xr.isPresenting` 时多跑一趟 `renderer.render()`
 *    会打乱 XR 的 framebuffer 绑定 ⇒ `update()` 里直接跳过。
 *
 * ── 接线上大概就是这样 ────────────────────────────────────────
 *
 *   const adapter = new CharacterShadowAdapter({ renderer, scene, sun: sunLight });
 *   adapter.attachScene(scene);                  // 接收面（含地面那 1500×1500）
 *   adapter.attachCharacter(avatarRoot);         // 角色加载完成后
 *   // 线上已有的刷新钩子，加一行：
 *   const world = Bg(scene, () => {
 *     renderer.shadowMap.needsUpdate = true;
 *     adapter.markWorldDirty();                  // 新区块的材质也要接收
 *   });
 *   function frame(dt) {
 *     …宿主自己的更新（角色位移在这一步）…
 *     adapter.update();                          // ★ 主渲染之前
 *     renderer.render(scene, camera);            //   或 composer.render(dt)
 *   }
 */

import * as THREE from 'three';
import { CharacterShadow } from './CharacterShadow.js';

/** 线上那盏灯的半影 = 300m / 2048² = 14.6cm ⇒ 对齐它要 4.7（实测 14.69cm） */
export const LIVE_RADIUS = 4.7;

export class CharacterShadowAdapter {
  /**
   * @param {object}  o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {THREE.Scene}         o.scene
   * @param {THREE.DirectionalLight} [o.sun=null]  给了就每帧从它位置反推光方向
   * @param {THREE.Vector3} [o.sunDirection=null]  或显式给一个方向
   * @param {number} [o.size=256]           阴影图边长
   * @param {number} [o.extent=4]           正交盒边长（米），只要罩住角色本体
   * @param {number} [o.radius=LIVE_RADIUS] PCF 采样半径（纹素）
   * @param {number} [o.bias=0.024]         深度偏移（**世界米**，不是归一化深度）
   * @param {number} [o.maxShadowLength=25] 影子尖最远伸出多少米
   */
  constructor({
    renderer,
    scene,
    sun = null,
    sunDirection = null,
    size = 256,
    extent = 4,
    radius = LIVE_RADIUS,
    bias = 0.024,
    maxShadowLength = 25,
    getGroundHeight = null,
  } = {}) {
    if (!renderer || !scene) throw new Error('[CharacterShadowAdapter] 需要 renderer 和 scene');

    this.renderer = renderer;
    this.scene = scene;
    this.sun = sun;
    this.getGroundHeight = getGroundHeight;

    /**
     * 占位投射体：**一个不在场景里的空组**。
     *
     * 为什么不直接拿宿主的角色：`attachCharacter()` 之前角色可能还没加载（线上
     * 角色是 `/api/avatar/<name>.glb` 异步来的），而 CharacterShadow 的构造器
     * 需要立刻有东西能量。给它一个空组，包围盒为空 ⇒ `update()` 自己早退，
     * 一次都不会画。
     *
     * **绝不能把宿主的角色 move 进一个包装组** —— 线上角色挂在被浮动原点平移过的
     * `world` 组下，重新挂父节点会连坐标一起改（角色瞬间跳到 70m 外）。
     * 所以换人走 `setCharacter()` 换引用，不动场景图。
     */
    this.character = new THREE.Group();
    this.character.name = 'CharacterShadowAdapter.placeholder';

    this.shadow = new CharacterShadow({
      renderer,
      scene,
      character: this.character,
      sunDirection: (sunDirection ?? (sun ? deriveSunDirection(sun) : null)
        ?? new THREE.Vector3(0.3, -0.6, -0.4)).clone(),
      size, extent, radius, bias, maxShadowLength,
    });

    /** 已经注入过接收面请求吗（`attachScene` 可能早于 `attachCharacter`） */
    this._sceneRoots = [];
    /** 标脏后**下一次 update()** 补一次遍历（流式新材质） */
    this._dirty = false;
    /** 跳过的材质按类型记数 —— 静默跳过是接线上最难查的故障 */
    this._skipped = new Map();
    this._injectedCount = 0;
    this._updates = 0;
    this._attachedRoot = null;
  }

  /** 专用图层号（`CharacterShadow.LAYER`）。宿主要确认这一层是空的 */
  static get LAYER() {
    return CharacterShadow.LAYER;
  }

  // ── 接线 ──────────────────────────────────────────────────────────────

  /**
   * 挂角色。加载完成 / 换模型 / 换皮肤后都要调。
   *
   * 做三件事，**缺一不可**：
   *   · 换 `character` 引用（复用同一个 RT，见 `CharacterShadow.setCharacter`）
   *   · 子树挪到专用图层（layers 逐对象、不继承）
   *   · `castShadow = false` —— 角色从场景那张图退场，影子完全交给专用图。
   *     两边都开会叠成双影（一张粗一张细）
   *
   * @param {THREE.Object3D} root
   * @param {object} [o]
   * @param {boolean} [o.keepReceive=true] 角色要不要接收别人的影子
   */
  attachCharacter(root, { keepReceive = true } = {}) {
    if (!root) return this;
    this._attachedRoot = root;
    this.shadow.setCharacter(root);
    this.shadow.prepareCharacterObject(root);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = keepReceive;
    });
    // 角色自己也注入 —— 这样它能在自己身上投射高精度自阴影。
    // 但它**不在**接收面列表里，标脏遍历不会重复注入（inject 有 WeakSet 去重）。
    this.shadow.injectScene(root);
    return this;
  }

  /** 摘掉角色（换模型前调一下也行，`attachCharacter` 会自己覆盖） */
  detachCharacter() {
    this._attachedRoot = null;
    this.shadow.setCharacter(this.character); // 换回空占位组 ⇒ 不再画
    return this;
  }

  /**
   * 注入接收面。**流式加载进来的 chunk 直接丢进来**，或者让 `markWorldDirty()`
   * 在下一帧统一补（后者更省事，量级一样）。
   *
   * @param {THREE.Object3D} [root=this.scene]
   */
  attachScene(root = this.scene) {
    if (!this._sceneRoots.includes(root)) this._sceneRoots.push(root);
    this._injectTree(root);
    return this;
  }

  /**
   * 世界变了（新区块落地、建筑流式加载完成、天气换了材质）—— 标一下，
   * **下一帧的 `update()` 会补一次遍历**。
   *
   * 挂到线上已有的那个钩子上：
   *   `Bg(scene, () => { renderer.shadowMap.needsUpdate = true; adapter.markWorldDirty(); })`
   */
  markWorldDirty() {
    this._dirty = true;
    return this;
  }

  /** 只注入一个材质（宿主自己造材质的热路径） */
  injectMaterial(m) {
    const before = this._injectedCount;
    this._injectOne(m);
    return this._injectedCount > before;
  }

  // ── 每帧 ──────────────────────────────────────────────────────────────

  /**
   * **每帧调一次，必须在主渲染之前。**
   *
   * 位置要求的原因：这一趟会临时 `setRenderTarget` 再跑一次 `renderer.render()`。
   * 放在主渲染**之后**是白跑（画面已经定型）；放在合成器**中间**会打乱它
   * read/write buffer 的互相喂（见 `CharacterShadow.update()` 里的状态存取）。
   * 放最前面最安全，而且那时角色的世界矩阵刚好是宿主这一帧算完的。
   */
  update() {
    // VR 下多跑一趟 renderer.render() 会打乱 XR 的 framebuffer 绑定 —— 不画。
    // 代价是 VR 里角色没影子（它仍 `castShadow=false`，进不了场景那张图），
    // 是"没有"而不是"错位"。这条要在真机 VR 上确认。
    if (this.renderer.xr?.isPresenting) return this;

    if (this.sun) {
      const d = deriveSunDirection(this.sun); // 光位置每帧被天空系统改写
      if (d) this.shadow.setSunDirection(d);
    }

    if (this._dirty) {
      for (const r of this._sceneRoots.length ? this._sceneRoots : [this.scene]) this._injectTree(r);
      this._dirty = false;
    }

    // 没挂角色时包围盒为空，update() 自己会早退 —— 这里不额外判断，
    // 少一条能对不上的状态（早退是 CharacterShadow 保证的行为）
    this.shadow.groundHeight = this.getGroundHeight?.(this._attachedRoot);
    this.shadow.update();
    this._updates++;
    return this;
  }

  // ── 参数 ──────────────────────────────────────────────────────────────

  /** 太阳方向。宿主若不想用 `followSun`，自己每帧喂也行 */
  followSun(light) {
    this.sun = light;
    return this;
  }

  setSunDirection(v) {
    this.shadow.setSunDirection(v);
    return this;
  }

  /**
   * 软度（PCF 采样半径，单位纹素）。热改，不重编译。
   * 默认 4.7 = 对齐线上那张图的半影（300m/2048² = 14.6cm，实测 14.69cm）。
   */
  setRadius(v) {
    this.shadow.setRadius(v);
    return this;
  }

  get radius() { return this.shadow.radius; }
  get size() { return this.shadow.size; }
  get extent() { return this.shadow.extent; }
  /** 上一帧算出的角色中心（**场景坐标**），诊断用 */
  get charCenter() { return this.shadow.charCenter; }
  /** 影子边缘过渡宽度（米）—— 该和周围场景影子的半影对齐 */
  get penumbraWorldSize() { return this.shadow.penumbraWorldSize; }
  /** 米/纹素。和周围场景阴影图的纹素边长是同一个量，可横向比 */
  get texelWorldSize() { return this.shadow.texelWorldSize; }
  /** 影子尖端的归一化深度。>=1 = 被 far 平面切掉（太阳压低时的头号故障） */
  get shadowTipDepth() { return this.shadow.shadowTipDepth; }
  /** 当前景深范围（米），随太阳高度角每帧变 */
  get depthRange() { return this.shadow.depthRange; }
  /** 角色在专用图里占多少纹素（要回读，见 `CharacterShadow.probe`） */
  probe() { return this.shadow.probe(); }

  /** 关掉 = 角色不投影（`castShadow=false` 仍在，不会掉回场景粗影） */
  set visible(v) { this.shadow.visible = v; }
  get visible() { return this.shadow.visible; }

  /** 诊断。接线上**把 `skipped` 打出来** —— 非 0 就说明有接收面收不到影子 */
  stats() {
    return {
      attached: !!this._attachedRoot,
      injected: this._injectedCount,
      skipped: Object.fromEntries(this._skipped),
      updates: this._updates,
      texelWorldSize: this.shadow.texelWorldSize,
      penumbraWorldSize: this.shadow.penumbraWorldSize,
      shadowTipDepth: this.shadow.shadowTipDepth,
      depthRange: this.shadow.depthRange,
      sunDirection: this.shadow.sunDirection.toArray().map((v) => +v.toFixed(4)),
    };
  }

  dispose() {
    this._attachedRoot = null;
    this.shadow.dispose();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────

  _injectTree(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) this._injectOne(m);
    });
  }

  _injectOne(m) {
    if (!m) return;
    if (m.isMeshStandardMaterial || m.isMeshPhongMaterial) {
      // 去重要在**调用之前**问：`inject` 内部那个 WeakSet 是原地 add 的，
      // 前后比引用永远相等（第一版就栽在这 —— 计数停在 1，
      // `stats().injected` 看着像"只注入了一个材质"）
      if (this.shadow.hasInjected(m)) return;
      this.shadow.inject(m);
      this._injectedCount++;
      return;
    }
    // 记下**为什么**没影子：跳过的材质种类。线上最难查的就是这一类
    const kind = m.type ?? (m.isShaderMaterial ? 'ShaderMaterial' : 'unknown');
    this._skipped.set(kind, (this._skipped.get(kind) ?? 0) + 1);
  }
}

/**
 * 从一盏平行光的位置反推它照向哪。
 *
 * 线上那盏灯 `position` 是"离原点 65m 的太阳方位"，`target` 没有赋值 ⇒ 默认在
 * 原点（three 造的那个默认 target 对象不在场景里，`matrixWorld` 恒为单位阵），
 * 所以方向就是 `-position` 归一化。夜里天空系统把它换成月亮方向，这里自动跟上。
 *
 * @param {THREE.DirectionalLight} light
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3|null} 位置退化到原点时返回 null（别拿零向量去归一化）
 */
export function deriveSunDirection(light, out = new THREE.Vector3()) {
  if (!light?.position) return null;
  const p = light.position;
  if (!Number.isFinite(p.x) || p.lengthSq() < 1e-8) return null;

  // target 被宿主动过（不在原点）时才需要 target - position
  const t = light.target;
  if (t?.matrixWorld) {
    out.setFromMatrixPosition(t.matrixWorld);
    if (out.lengthSq() > 1e-8) return out.sub(p).normalize();
  }
  return out.copy(p).negate().normalize();
}
