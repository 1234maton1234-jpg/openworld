import * as THREE from 'three';

/**
 * 角色专用高分辨率阴影图。
 *
 * ── 为什么需要它 ──────────────────────────────────────────
 * CSM 的级联盒是照着**相机视锥**建的，第三人称下角色离相机 30~60 m，
 * 落在一个 114 m 宽的盒子里只占极小一块。实测角色在级联 0 的 2048² 图上
 * 只有 261 px（纹素 5.5 cm），而且只有它的影子边缘在抖 —— 因为**静止物体
 * 的影子在阴影图里逐帧完全不变**（纹素吸附是钉死的），只有移动的角色每帧
 * 在不同纹素上重新光栅化：7 m/s、60fps 下每帧跨 2.1 个纹素，PCF 再把这个
 * 每帧都在改形状的边糊开。实测抖动随纹素单调下降：
 *
 *   14.6cm → 10.24%   5.9cm → 2.18%   5.5cm → 1.16%   2.75cm → 0.15%
 *
 * 这张图用 256² 罩住角色周围 4 m ⇒ **1.56 cm/纹素**，比级联 0 细 3.5 倍，
 * 内存 256 KB（CSM 提到 4096 要 268 MB，而且不支持逐级联不同尺寸）。
 *
 * ── 为什么不是"越细越好" ─────────────────────────────────
 * 一开始用的是 1024² / 4 m = 0.39 cm/纹素，细 14 倍。结果是**边缘太锐**：
 * 场景里其它影子走 three 的 `PCFSoftShadowMap`，对平行光只有**一个纹素**
 * 宽的双线性重建，过渡 ≈ 5.5 cm；而这张图当时是硬二值判定，过渡 ≈ 0。
 * 比周围锐十几倍的影子，看起来就是"贴上去的"，不像长在地上的。
 *
 * 所以分辨率要**对齐场景的软度**，多出来的精度不是细节、是不自然：
 * 纹素 1.56 cm × 采样盘半径 1.75 纹素 ⇒ 过渡约 5.5 cm，与级联 0 一致。
 * 关键是——**这套"稳"是靠图随角色走换来的，跟分辨率无关**，
 * 所以降到 256² 依然一丝都不抖（实测见 README）。
 * 想更锐就把 `radius` 调小，想更柔就调大，两件事互不影响。
 *
 * ── 盒边长为什么是 4m，且**不随太阳高低变** ───────────────
 * 这里踩过一次坑，记清楚免得再犯：曾经以为"太阳压到 20° 时影子长 4.7m，
 * 4m 的盒子会切掉影子尖"，于是打算把盒子按太阳高度角撑大。**这个推理是错的。**
 *
 * 影子是遮挡体**沿光轴方向**投影出来的，沿光轴平移不改变"垂直于光轴的坐标"。
 * 所以在阴影相机自己的视图空间里，影子落点和产生它的遮挡体占的是**同一个
 * 窗口**（x/y 完全相同，只是深度不同）。结论：盒子只要罩得住**角色本体**，
 * 就必然罩得住它的影子，太阳再低也一样。
 *
 * 真正随太阳高度角变化的是**景深**：影子尖沿光轴比角色远出
 * `角色高度 / sin(高度角)` —— 50° 时 2.2m，5° 时 19.5m，差近 10 倍。
 * 那一段一旦越过 `far`，着色器里 `c.z > 1` 会把它整段判成"全亮"，
 * 表现是影子中段开始莫名其妙地消失。所以 near/far 现在是**按太阳方向现算的**
 * （见 `_updateCamera()`），而不是拍一个固定值。
 *
 * ── 怎么做到"只有角色进这张图" ────────────────────────────
 * three 的 `WebGLShadowMap.renderObject()` 用的是**主相机**的 layers
 * （`renderObject(scene, camera, shadow.camera, …)` 里 `camera.layers`），
 * `shadow.camera.layers` 只用于矩阵 —— 所以**没法**靠 layers 把角色从
 * CSM 贴图里排除，也没法靠它把世界从这张图里排除。
 *
 * 于是这里不走 three 的阴影通道，而是**自己做一趟深度渲染**：
 *   `renderer.render(scene, charCam)` 走的是前向渲染路径，那条路上的
 *   layers 判断用的是**传入的相机** —— 也就是这里的 charCam。所以
 *   charCam.layers 设成只认角色那一层，就真的只有角色会被画进来。
 *
 * 角色那一侧则改用 `castShadow = false` 把它挡在 CSM 贴图外。两边都干净，
 * 于是接收面**相乘**就是对的：CSM 负责世界、这张图负责角色，两个来源不相交，
 * 不会出现"同一个影子被扣两次"的过暗。
 *
 * ── 为什么用 DepthTexture 而不是 RGBADepthPacking ──────────
 * 正交相机的深度缓冲值就是 `(视深 - near) / (far - near)`，**线性**，
 * 而 `shadowMatrix` 算出来的 `c.z` 正好是同一个量 —— 直接比就行，
 * 不需要 `unpackRGBAToDepth`。这顺带绕开了 `packing` chunk 的重复包含问题
 * （自己 `#include <packing>` 可能和 `shadowmap_pars_fragment` 里那次撞车）。
 */
export class CharacterShadow {
  /**
   * 角色所在的图层。主相机靠 layer 0 看见它（默认就有），
   * 这张图的相机只认 layer 2 —— 两者互不干扰。
   */
  static LAYER = 2;

  constructor({
    renderer,
    scene,
    character,
    /** 太阳方向：从太阳指向场景（默认位置 (-30,60,40) 对应方向 (30,-60,-40)） */
    sunDirection = new THREE.Vector3(30, -60, -40).normalize(),
    /** 阴影图边长 */
    size = 256,
    /**
     * 正交盒边长（米）。只要罩住**角色本体**（约 0.6 × 1.7 × 0.6）加一圈
     * PCF 采样余量就够 —— **不需要**为"影子很长"而放大（理由见类注释：
     * 影子落在和本体同一个光轴垂直窗口里）。4 m 给 1.7 m 高的角色留了
     * 约 1 m 余量，够用。
     */
    extent = 4,
    /**
     * PCF 采样盘半径，单位是**纹素**。见 `charShadowFactor()` 的注释 ——
     * 这个值决定影子边缘有多软，默认按"和场景其它影子一样软"取值。
     */
    radius = 1.75,
    /**
     * 深度偏移，单位是**世界米**（不是归一化深度）。正交深度是线性的，
     * 所以每帧按 `bias / (far - near)` 换算成归一化值 —— 这样 near/far
     * 随太阳高低变化时，偏移的**物理大小保持不变**（写死归一化值就会
     * 随景深范围一起缩放，太阳一低压就长痤疮）。
     * 默认 0.024 m 是原来写死 0.0012（当时 near/far 固定 10/30 ⇒ 20 m）的实际效果。
     */
    bias = 0.024,
    /**
     * 影子尖允许伸出的最大距离（米）—— 景深范围的上限，防止太阳贴近
     * 地平线时 `角色高度 / sin(高度角)` 发散成无穷大。超过它的那段影子
     * 会被 far 平面切掉。
     *
     * 25 m 是按**宿主真实的下限**定的：那盏灯的最低高度角被钳在一个很小的角度上
     * （约 4.4°），角色影子最长 1.7/tan(4.4°)=22.2 m。
     * 所以 25 是"现实里够用且只多不少"。
     */
    maxShadowLength = 25,
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.character = character;
    this.sunDirection = sunDirection.clone().normalize();
    this.size = size;
    this.extent = extent;
    this.bias = bias;
    this.radius = radius;

    /**
     * 所有注入材质**共用同一个** uniform 对象 —— 改 `.value` 一处，
     * 全部材质同时生效（滑块要能热调软度）。也避免 onBeforeCompile
     * 每次重编译都新建一个 uniform 对象、在数组里越堆越多。
     */
    this._radiusUniform = { value: radius };

    /** 同上，深度偏移也共用一份 —— 每帧按当前景深范围换算后再写进去 */
    this._biasUniform = { value: bias };

    this.maxShadowLength = maxShadowLength;

    /** 角色包围球半径，每帧更新 —— 用来定 near 平面（不能切到角色自己） */
    this._casterRadius = 1;
    /** 影子尖端的归一化深度，>1 就是被 far 切了。诊断用 */
    this._tipDepth = NaN;
    this._tip = new THREE.Vector3();
    this._size = new THREE.Vector3();

    /** 相机沿光轴离角色的距离 —— 只要把角色整个罩进 near/far 就行 */
    this.lightDistance = 20;

    /**
     * 是否把角色画进这张图。false 时把图清成"全远"（全亮），
     * 等价于角色不投影 —— 但角色本身在主画面里照常可见。
     */
    this.visible = true;

    // 颜色附件用不上（我们只读深度），但仍需存在，否则 RT 不完整
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.rt.depthTexture = new THREE.DepthTexture(size, size);
    this.rt.depthTexture.minFilter = THREE.NearestFilter;
    this.rt.depthTexture.magFilter = THREE.NearestFilter;

    this.cam = new THREE.OrthographicCamera(
      -extent / 2, extent / 2, extent / 2, -extent / 2,
      this.lightDistance - 10, this.lightDistance + 10
    );
    // 只认角色那一层 —— 这一条就是"只有角色进图"的全部机关
    this.cam.layers.set(CharacterShadow.LAYER);

    /** 世界坐标 → [0,1]³ 的偏移矩阵（与 three 内部 shadowMatrix 同一个构造） */
    this._biasMatrix = new THREE.Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1
    );
    this.matrix = new THREE.Matrix4();

    /**
     * 深度材质。着色器采样用的是 DepthTexture（线性、精确），这个颜色输出
     * 只为**回读探针**服务 —— 深度附件回读不了，颜色附件可以。
     * `BasicDepthPacking` 写的是 `vec3(1 - 线性深度)`，所以只要清成全白，
     * "有角色"就是 r < 1.0，一眼可分。
     */
    this._depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });

    this._charPos = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._clearColor = new THREE.Color();

    this._setupLayers();

    // 构造期先清一次（理由见 `_clearTarget`）。必须在 RT 建好之后。
    this._clearTarget();
  }

  /**
   * 把图清成"全远" = 全亮，**并把 renderer 状态原样还回去**。
   *
   * 为什么构造期就得清一次：RT 是惰性分配的，而 `update()` 在**没挂角色**时
   * （空包围盒）会早退、一次都不渲染。这段时间里 `attachScene()` 已经把接收面
   * 材质注入了 —— 那些材质会去采样一张**从没渲染过**的纹理。WebGL 里新纹理的
   * 内容是未定义的（实测读回全 0），于是 `z - bias <= stored` 对绝大多数片元
   * 不成立 ⇒ 整片地面被判成"全体在阴影里"，直接黑掉。
   *
   * 这个窗口在开发测试台里几乎不存在（角色是同步建的，构造完立刻 attach），
   * 但**接进宿主后一定存在**：宿主角色通常是异步加载的。所以宁可多清这一趟。
   */
  _clearTarget() {
    const { renderer } = this;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(this._clearColor);
    const prevAlpha = renderer.getClearAlpha();

    this._clearNow();

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this._clearColor, prevAlpha);
    renderer.autoClear = prevAutoClear;
  }

  /** 清成"全远"的那几步，**不管 renderer 状态的存取** —— 由调用方负责 */
  _clearNow() {
    const { renderer } = this;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
  }

  /** 把角色整棵子树挪到专用图层上（layers 是逐对象的，不继承） */
  _setupLayers() {
    this.character.traverse((o) => {
      o.layers.enable(CharacterShadow.LAYER);
    });
  }

  /** 新增的角色网格（换了模型等）也要记得调 */
  prepareCharacterObject(root) {
    root.traverse((o) => o.layers.enable(CharacterShadow.LAYER));
  }

  /**
   * 换投射体（换模型 / 换皮肤 / 换角色）。
   *
   * **必须reuse 同一个实例，不能重建** —— 已经注入过的材质里
   * `charShadowMap` 这个 uniform 的 value 是在编译期就绑到 `this.rt.depthTexture`
   * 上的，重建一个 CharacterShadow 会让所有老材质继续采样**旧的**那张图
   * （表现为影子停在换模型那一刻不动，或者直接全亮）。
   * 所以换人只换 `character` 这一个引用，RT / uniforms / 矩阵全都不动。
   *
   * 调用方自己负责把新角色的 `castShadow` 关掉（它不能再进场景那张图）。
   */
  setCharacter(root) {
    this.character = root;
    this._setupLayers();
  }

  /**
   * 角色盒子中心。用包围盒而不是脚底 —— 胶囊挂在 y=0.85，
   * 用脚底会让盒子上半部分浪费掉。
   */
  _updateCamera() {
    // 必须刷新**父链**再量角色位置。
    // `world.position` 是这一帧刚改的（跨格时一次跳 70 m），而 `world.matrixWorld`
    // 要等到 `renderer.render()` 里的 `scene.updateMatrixWorld()` 才重算 ——
    // 那已经在本函数之后了。只调 `character.updateMatrixWorld(true)` 会拿**过期的
    // 父矩阵**去乘自己的新局部矩阵，量出来的角色世界位置偏差正好一个格子宽
    // （实测 70.00 m）。角色于是掉出 4 m 的正交盒，整张图被清成全白 ——
    // 表现就是**每过一个区块，角色影子消失一帧**。
    // updateWorldMatrix(true, …) 会先把祖先链刷一遍，这是与调用顺序无关的写法。
    this.character.updateWorldMatrix(true, true);
    this._box.setFromObject(this.character);
    if (this._box.isEmpty()) return false;
    this._box.getCenter(this._charPos);

    const d = this.sunDirection;
    this._box.getSize(this._size);
    this._casterRadius = this._size.length() / 2;

    // 影子尖沿光轴比角色最远点还远出 t = 角色高度 / sin(太阳高度角)。
    // 这个量随太阳高低变化近 10 倍，所以 near/far 每帧现算（见类注释）。
    const span = this._box.max.y - this._box.min.y;
    const tMax = d.y < -1e-4
      ? Math.min(span / -d.y, this.maxShadowLength)
      : this.maxShadowLength;

    this.cam.position.copy(this._charPos).addScaledVector(d, -this.lightDistance);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this._charPos);
    this.cam.updateMatrixWorld(true);
    // 盒子罩住角色本体即可（影子必然落在同一个光轴垂直窗口里）；
    // 变的是景深：near 不能切到角色，far 要放影子尖出去。
    this.cam.near = Math.max(0.1, this.lightDistance - this._casterRadius - 1);
    this.cam.far = this.lightDistance + Math.max(tMax, this._casterRadius) + 1;
    this.cam.updateProjectionMatrix();

    this.matrix
      .multiplyMatrices(this._biasMatrix, this.cam.projectionMatrix)
      .multiply(this.cam.matrixWorldInverse);

    // 偏移量按世界米换算成归一化深度 —— 景深范围变了，物理偏移不能跟着变
    this._biasUniform.value = this.bias / (this.cam.far - this.cam.near);

    // 影子尖端的归一化深度，>1 说明被 far 切掉（那段影子会整段消失）。
    // 这是"太阳压低时影子会不会断"的直接读数，trace 里打出来。
    this._tip.set(this._charPos.x, this._box.max.y, this._charPos.z)
      .addScaledVector(d, tMax);
    this._tipDepth = this._tip.applyMatrix4(this.matrix).z;
    return true;
  }

  /** 纹理尺寸（米/纹素），诊断用 */
  get texelWorldSize() {
    return this.extent / this.size;
  }

  /** 上一帧算出的角色中心（**场景坐标**），诊断用 */
  get charCenter() {
    return this._charPos;
  }

  /** 影子边缘的过渡宽度（米）—— 采样盘直径。诊断用 */
  get penumbraWorldSize() {
    return 2 * this.radius * this.texelWorldSize;
  }

  /** 影子尖端的归一化深度。>1 = 被 far 平面切掉，那段影子会整段消失。诊断用 */
  get shadowTipDepth() {
    return this._tipDepth;
  }

  /** 当前景深范围（米）。随太阳高度角每帧变，诊断用 */
  get depthRange() {
    return { near: this.cam.near, far: this.cam.far };
  }

  /** 热调 PCF 半径（纹素）。所有注入材质共用同一个 uniform 对象，改一处全生效 */
  setRadius(v) {
    this.radius = v;
    this._radiusUniform.value = v;
  }

  /**
   * 换太阳方向。**宿主的太阳是动的**（天空系统每轮更新都改那盏灯的位置），
   * 不跟的话构造期克隆的那份就会过期 —— 影子朝着旧太阳、和场景光照脱开，
   * 而且 near/far 是按这个方向算的，一起错。接进宿主后每轮天空更新都要调。
   */
  setSunDirection(v) {
    this.sunDirection.copy(v).normalize();
  }

  /**
   * 回读颜色附件，数出角色占了几个纹素。
   *
   * 这是**唯一**能定住"边缘抖不抖"的客观读数：解析法（把包围盒投到图上）
   * 只会给出一个恒定值，因为角色的包围盒不随移动变化 —— 抖的正是
   * **光栅化后**的占位，必须真的把图读回来数。
   *
   * 和 CSM 那边的 `probeShadowMap` 是同一个量，可直接横向比。
   */
  probe() {
    if (!this._buf || this._buf.length !== this.size * this.size * 4) {
      this._buf = new Uint8Array(this.size * this.size * 4);
    }
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this._buf);
    let n = 0;
    let deepest = 0;
    for (let i = 0; i < this._buf.length; i += 4) {
      const r = this._buf[i];
      // 清成白色 ⇒ 没角色的地方 r = 255。角色写的是 255*(1-深度)，必然更暗
      if (r < 250) {
        n++;
        if (r > deepest) deepest = r;
      }
    }
    return { count: n, deepest };
  }

  /** 渲一趟深度。角色的世界矩阵必须已是当前帧的。 */
  update() {
    if (!this._updateCamera()) return;

    const { renderer, scene } = this;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    const prevAutoClear = renderer.autoClear;
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(this._clearColor);
    const prevAlpha = renderer.getClearAlpha();

    // 我们这趟只是个深度渲染，不该顺带把 CSM 的级联通道也跑一遍 ——
    // shadow.update() 已经把 needsUpdate 置位，renderer.render() 会照单执行。
    // 摘掉再放回，让主渲染那趟去做它该做的事。
    const needsShadow = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;

    // 清成"全远"。构造期那次和这里是**同一段**（`_clearNow`）——
    // 两边分开写迟早会漂，而这两处漂了的后果正好是最难查的那种（全黑 / 全亮）
    this._clearNow();

    if (this.visible) {
      // 前向渲染路径会用**传入相机的 layers** 过滤 —— 传 charCam 就只剩角色。
      // 背景必须摘掉：它会画一张全屏四边形，直接盖掉刚清好的深度底板。
      scene.overrideMaterial = this._depthMaterial;
      scene.background = null;
      renderer.render(scene, this.cam);
    }

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this._clearColor, prevAlpha);
    renderer.autoClear = prevAutoClear;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    renderer.shadowMap.needsUpdate = needsShadow;
  }

  /** 这个材质注入过吗。适配层用它去重和计数（不要从外面直接摸 `_injected`） */
  hasInjected(material) {
    return !!this._injected?.has(material);
  }

  /**
   * 给接收阴影的材质注入"乘上角色阴影"的代码。
   *
   * 必须**串在已有的 onBeforeCompile 之后** —— CSM 的 setupMaterial() 也往
   * 同一个钩子上挂东西，直接覆盖会让 CSM 静默失效。
   *
   * 注入点在 `lights_fragment_end`：那里所有直接光照已经累加完，
   * 乘上去等价于"这些光被挡了一部分"。
   */
  inject(material) {
    if (!material || this._injected?.has(material)) return;
    if (!material.isMeshStandardMaterial && !material.isMeshPhongMaterial) return;
    (this._injected ??= new WeakSet()).add(material);

    const self = this;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function (shader) {
      prev?.call(this, shader);

      shader.uniforms.charShadowMap = { value: self.rt.depthTexture };
      shader.uniforms.charShadowMatrix = { value: self.matrix };
      shader.uniforms.charShadowBias = self._biasUniform;
      shader.uniforms.charShadowTexel = { value: 1 / self.size };
      shader.uniforms.charShadowRadius = self._radiusUniform;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform mat4 charShadowMatrix;
varying vec4 vCharShadowCoord;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
// 世界坐标 = modelMatrix × (实例变换 × transformed)。实例矩阵那两步必须带上 ——
// 它们和 three 自己的 project_vertex 里那段是同一套 #ifdef。
// 漏掉的话 InstancedMesh / BatchedMesh 算出来是"没加实例偏移的基准位"，
// 接收面的角色影子坐标会落到别处（盒子内可能凭空多一块暗斑）。
vec4 charWorldPos = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	charWorldPos = batchingMatrix * charWorldPos;
#endif
#ifdef USE_INSTANCING
	charWorldPos = instanceMatrix * charWorldPos;
#endif
vCharShadowCoord = charShadowMatrix * modelMatrix * charWorldPos;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D charShadowMap;
uniform float charShadowBias;
uniform float charShadowTexel;   // 1 / 图边长
uniform float charShadowRadius;  // PCF 采样盘半径（纹素）
varying vec4 vCharShadowCoord;

/**
 * 单次比较。正交深度是线性的，所以 c.z 与深度图里存的值可以直接比，
 * 不需要 unpackRGBAToDepth。越界一律返回 1.0（全亮）——
 * 和 three 的 getShadow 同一个约定：出了盒子就不该由这张图负责。
 */
float charShadowTap( vec2 uv, float z ) {
  if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return 1.0;
  float stored = texture2D( charShadowMap, uv ).r;
  return ( z - charShadowBias <= stored ) ? 1.0 : 0.0;
}

/**
 * 圆盘 PCF。**这一步不是修饰，是必需的。**
 *
 * 场景里所有其它影子走 three 的 PCFSoftShadowMap，它对**平行光**
 * 只在一个纹素宽度上做双线性重建（shadow.radius 在那个分支里压根没出现），
 * 所以周围影子的半影就等于**那张图的纹素边长**。这张图原本是硬二值判定 ——
 * 过渡宽度 ≈ 0，边缘比周围锐十几倍，看着就是"贴上去的"。
 *
 * **要对齐哪个纹素取决于叠在哪个方案上**（两个差 2.7 倍，别搞混）：
 *   · 叠在 CSM 上 → 级联 0 是 2048² 罩 114m = 5.5 cm ⇒ radius 1.75
 *   · 叠在**单张基线图**上（宿主没有 CSM 时的形状）→ 2048² 罩 300m
 *     = **14.6 cm** ⇒ radius **4.7**（实测过渡 14.69 cm）
 *
 * 12 个样本按黄金角螺旋铺满圆盘，再按像素坐标整体旋转：
 * 固定网格会留下肉眼可见的方格纹，逐像素旋转把它打散成噪点，观感自然得多。
 * 采样盘半径 charShadowRadius 纹素 × 直径 2r 就是过渡宽度（米）。
 */
float charShadowFactor() {
  vec3 c = vCharShadowCoord.xyz / vCharShadowCoord.w;
  if ( c.z > 1.0 ) return 1.0;
  float rot = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
  float lit = 0.0;
  for ( int i = 0; i < 12; i ++ ) {
    float fi = float( i ) + 0.5;
    float r = sqrt( fi / 12.0 ) * charShadowRadius * charShadowTexel;
    float a = fi * 2.39996323 + rot;
    lit += charShadowTap( c.xy + vec2( cos( a ), sin( a ) ) * r, c.z );
  }
  return lit / 12.0;
}`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
{
  float cs = charShadowFactor();
  // ★ 只乘**平行光那一份**，点光/聚光/面光的份额原样留着。
  //
  // 第一版是 reflectedLight.directDiffuse *= cs，看着没问题（这张图就是给太阳
  // 投的影子），但 directDiffuse 是**所有直射光之和** —— 夜里街灯
  // （PointLight，强度很高、decay 2，且**不投影**）才是画面上唯一的强直射光，
  // 于是乘子把街灯的光也一起乘掉，在灯下的地面上挖出一块没有任何光源能解释的
  // 黑斑：场景阴影图里没有对应的影子（街灯不投影），只有这块地被压暗了。
  // 开发测试台实测：深核 4086px 只剩 28% 的光（启用均值 63 / 停用 230）。
  //
  // 白天的读数必须逐位不变，所以用「非平行光份额 + 平行光份额×cs」而不是
  // 「总份额 − 平行光份额×(1−cs)」：前者在非平行光份额为 0 时是 0.0 + x，
  // 而 0.0 + x == x 在浮点下**精确成立**；后者的乘减会多一次舍入。
  // 白天路灯全灭 ⇒ 非平行光份额恰好是 0 ⇒ 与旧的 *= cs 逐位相同。
  reflectedLight.directDiffuse =
    charShadowNonDirDiffuse + charShadowDirDiffuse * cs;
  reflectedLight.directSpecular =
    charShadowNonDirSpecular + charShadowDirSpecular * cs;
}`
        );

      // `lights_fragment_begin` 里**先点光、再聚光、最后才平行光**（r180 的顺序，
      // 见 ShaderChunk/lights_fragment_begin.glsl.js），所以「平行光份额」可以在
      // 平行光那一段的前后各取一次快照做差得到。
      //
      // 这两处快照必须在 `lights_fragment_begin` **内部**，没法从外面 replace
      // —— 所以把整个 chunk 展开后替换掉 shader 里的 `#include`。
      // **用 three 自己的 chunk 文本**（而不是抄一份），这样它升级时不会悄悄漂。
      // 这一段里没有嵌套 `#include`（查过），展开是安全的。
      const DIR_OPEN = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
      const RECT_OPEN = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
      const beginPatched = THREE.ShaderChunk.lights_fragment_begin
        // 平行光这一段之前：此刻 directDiffuse 里只有点光+聚光（面光在更后面）
        .replace(
          DIR_OPEN,
          `vec3 charShadowNonDirDiffuse = reflectedLight.directDiffuse;
vec3 charShadowNonDirSpecular = reflectedLight.directSpecular;

${DIR_OPEN}`
        )
        // 平行光这一段之后（面光那一段之前）：做差就是平行光的份额
        .replace(
          RECT_OPEN,
          `vec3 charShadowDirDiffuse = reflectedLight.directDiffuse - charShadowNonDirDiffuse;
vec3 charShadowDirSpecular = reflectedLight.directSpecular - charShadowNonDirSpecular;

${RECT_OPEN}`
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        beginPatched
      );
    };
    material.needsUpdate = true;
  }

  /** 遍历场景注入（角色自己也注入 —— 这样它能在自己身上投射高精度自阴影） */
  injectScene(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) this.inject(m);
    });
  }

  /** 角色在阴影图里占多少纹素（诊断用，和 probe 的算法一致） */
  dispose() {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this._depthMaterial.dispose();
  }
}
