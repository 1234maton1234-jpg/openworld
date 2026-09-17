/**
 * `CharacterShadowAdapter` 的自检。
 *
 * 为什么要单独一个入口：接入之后日常跑的那套画面只覆盖适配层**已经在用**的那部分
 * API —— 每帧反推太阳、注入接收面、定位角色。而适配层里最容易静默出错的，是
 * **面向宿主**的那几条：流式新材质补注入、换角色复用 RT、XR 守卫。
 * （错了不会有异常，只会"新开的那片地没有角色影子"。）
 *
 * 所以这里自己造一个最小宿主（地面 + 一个方盒子当角色 + 一盏平行光），
 * 逐条断言，把结果打成文本。跑法见 selfcheck/adapter-check.html 顶部注释。
 *
 * 断言失败**不中断** —— 一次跑完能看到所有问题，修一条不用重跑一轮。
 */

import * as THREE from 'three';
import { CharacterShadowAdapter, deriveSunDirection } from '../src/lighting/shadow/CharacterShadowAdapter.js';

const out = [];
let pass = 0;
let fail = 0;

/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = '') {
  (ok ? pass++ : fail++);
  out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function vecEq(a, b, eps = 1e-6) {
  return near(a.x, b.x, eps) && near(a.y, b.y, eps) && near(a.z, b.z, eps);
}

// ── 最小宿主 ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 240);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 200);
camera.position.set(6, 4, 8);
camera.lookAt(0, 1, 0);

/** 自检宿主那盏灯的初值位置：(-30,60,40)，模长 78.1 ⇒ 高度角 50.19° */
const SUN_HOME = new THREE.Vector3(-30, 60, 40);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.copy(SUN_HOME);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -150; sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 0; sun.shadow.camera.far = 220;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404040, 1));

const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a6b35 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/** 角色用方盒子代替：0.6 × 1.7 × 0.6，和真角色一个量级 */
function makeCharacter(x, z, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.6), mat);
  body.position.y = 0.85;
  g.add(body);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
const charMat = new THREE.MeshStandardMaterial({ color: 0xcc4444 });
const charA = makeCharacter(0, 0, charMat);

// ── 1. 太阳方向反推（纯函数）────────────────────────────────
{
  const d = deriveSunDirection(sun);
  const want = SUN_HOME.clone().negate().normalize();
  check('反推 = -position 归一化（宿主那盏灯的形状）', !!d && vecEq(d, want),
    d ? `得 (${d.toArray().map((v) => v.toFixed(4))})` : '得 null');

  // target 被宿主动过（不在原点）时，必须走 target - position
  const l2 = new THREE.DirectionalLight();
  l2.position.set(100, 80, 0);
  l2.target.position.set(0, 0, 0);
  l2.target.updateMatrixWorld();
  const d2 = deriveSunDirection(l2);
  check('target 在原点时退化成 -position', !!d2 && vecEq(d2, new THREE.Vector3(-100, -80, 0).normalize()));

  l2.target.position.set(40, 10, -20);
  l2.target.updateMatrixWorld();
  const d3 = deriveSunDirection(l2);
  const want3 = new THREE.Vector3(40, 10, -20).sub(l2.position).normalize();
  check('target 被挪走后走 target - position', !!d3 && vecEq(d3, want3),
    d3 ? `得 (${d3.toArray().map((v) => v.toFixed(3))})` : '得 null');

  // 退化到原点不能拿零向量去归一化（会得到 NaN 方向，影子彻底乱掉）
  const l3 = new THREE.DirectionalLight();
  l3.position.set(0, 0, 0);
  l3.target.position.set(0, 0, 0);
  l3.target.updateMatrixWorld();
  check('位置退化到原点时返回 null（不是 NaN 方向）', deriveSunDirection(l3) === null);
}

// ── 2. 没挂角色时不该画任何东西 ──────────────────────────────
// 宿主角色是异步加载的，适配层从构造到 attachCharacter 之间会跑很多帧。
// 这段里 `update()` 必须安全且不画（空包围盒 ⇒ 早退），否则就是用一张空图
// 去乘所有材质 —— 画面会整体变亮或变暗，而且极难归因。
const adapter = new CharacterShadowAdapter({
  renderer, scene, sun, size: 256, extent: 4, radius: 4.7,
});

{
  let threw = null;
  try { adapter.update(); } catch (e) { threw = e; }
  check('未挂角色时 update() 不抛', !threw, threw ? String(threw) : '');
  // 这条不只是"好看"：图必须是干净的**全远**白色。RT 是惰性分配的，如果构造期
  // 没清过，它此刻装的是未定义内容（实测全 0），而 `attachScene()` 已经在这个
  // 窗口里把地面材质注入了 —— 于是 `z - bias <= stored(0)` 基本不成立，
  // 整片地面被判成"全体在阴影里"直接黑掉。宿主角色是异步加载的，这个窗口真实存在。
  check('未挂角色时图是干净的"全远"（构造期清过一次，不是未定义内容）',
    adapter.probe().count === 0, `count=${adapter.probe().count}（应 0 / 65536）`);
  check('未挂角色时 stats().attached = false', adapter.stats().attached === false);
}

// ── 3. 太阳方向每帧反推（宿主不动任何一行适配层代码）──────────
{
  adapter.update();
  const s1 = adapter.stats().sunDirection;
  const want1 = SUN_HOME.clone().negate().normalize();
  check('update() 后方向 = 灯位置反推', near(s1[0], want1.x, 1e-4) && near(s1[1], want1.y, 1e-4) && near(s1[2], want1.z, 1e-4),
    `(${s1.join(', ')})`);

  // 直接把灯挪到"太阳压低"的位置 —— 适配层必须自己跟上，宿主一行都不用改
  sun.position.set(-9, 5, 12);
  adapter.update();
  const s2 = adapter.stats().sunDirection;
  const want2 = new THREE.Vector3(-9, 5, 12).negate().normalize();
  check('灯被挪走后下一帧就跟上（宿主天空系统每轮都改灯位）',
    near(s2[0], want2.x, 1e-4) && near(s2[1], want2.y, 1e-4) && near(s2[2], want2.z, 1e-4),
    `(${s2.join(', ')})`);
  sun.position.copy(SUN_HOME);
  adapter.update();
}

// ── 4. 接收面注入 + 流式新材质补注入 ─────────────────────────
adapter.attachScene(scene);
{
  check('attachScene 注入到了地面材质', adapter.shadow.hasInjected(groundMat));
  const base = adapter.stats().injected;

  // 模拟流式加载：跑着跑着一片新区块落地，带来**运行时新建的**材质。
  // 这不是假设 —— 流式地形/道路就是按区块现造 MeshStandardMaterial 的。
  const newMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const newMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), newMat);
  newMesh.position.set(3, 0.5, 3);
  scene.add(newMesh);
  check('新材质的注入在标脏之前**还没**发生（说明构造期那次遍历确实够不到）',
    !adapter.shadow.hasInjected(newMat));

  adapter.markWorldDirty();
  adapter.update();
  check('markWorldDirty + update() 后新材质被注入', adapter.shadow.hasInjected(newMat));
  check('注入计数 +1', adapter.stats().injected === base + 1,
    `${base} → ${adapter.stats().injected}`);

  // 重复标脏不该重复计数（WeakSet 去重；第一版比 WeakSet 引用，计数停在 1）
  adapter.markWorldDirty();
  adapter.update();
  adapter.markWorldDirty();
  adapter.update();
  check('重复标脏不重复计数', adapter.stats().injected === base + 1,
    `仍为 ${adapter.stats().injected}`);
}

// ── 5. 跳过的材质要能被诊断出来 ──────────────────────────────
// 静默跳过是接进宿主后最难查的故障：地上就是没影子，但没有任何报错。
{
  const basic = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), basic);
  m.rotation.x = -Math.PI / 2;
  m.position.set(-3, 0.01, -3);
  scene.add(m);
  adapter.markWorldDirty();
  adapter.update();
  const sk = adapter.stats().skipped;
  check('不被支持的材质进 skipped 计数（不是静默丢弃）', (sk.MeshBasicMaterial ?? 0) >= 1,
    JSON.stringify(sk));
}

// ── 6. 挂角色：图层、castShadow、自阴影 ──────────────────────
{
  adapter.attachCharacter(charA);
  let allLayer = true, noneCast = true, allReceive = true;
  const want = (1 << 0) | (1 << CharacterShadowAdapter.LAYER);
  charA.traverse((o) => {
    if (o.isMesh) {
      if ((o.layers.mask & want) !== want) allLayer = false;
      if (o.castShadow) noneCast = false;
      if (!o.receiveShadow) allReceive = false;
    }
  });
  // 注意断言的是"专用图层**已启用**"，不是"只剩这一层" —— 角色必须同时留在
  // 图层 0 上，否则主相机（只认图层 0）就看不见它了。layers 是按位并存的。
  check('角色整棵子树启用了专用图层（且没被踢出图层 0）', allLayer,
    `mask=${charA.children[0].layers.mask}（1|1<<${CharacterShadowAdapter.LAYER} = ${1 | (1 << CharacterShadowAdapter.LAYER)}）`);
  check('角色 castShadow 全部关掉（否则和场景图叠成双影）', noneCast);
  check('角色 receiveShadow 保持（默认 keepReceive=true）', allReceive);
  check('角色自己的材质也注入了（高精度自阴影）', adapter.shadow.hasInjected(charMat));
  adapter.update();
  check('挂上角色后图里有占位（影子真的画进去了）', adapter.probe().count > 0,
    `count=${adapter.probe().count}`);
}

// ── 7. 换角色：**必须复用同一个 RT** ────────────────────────
// 这是接进宿主后换模型/换皮肤的那条路。已注入材质的 `charShadowMap` uniform 在编译期
// 就绑到了 `rt.depthTexture` 上；一旦重建 CharacterShadow，老材质会继续采样旧图 ——
// 表现是影子停在换模型那一刻不动，或者直接全亮。所以这里钉死两件事：
// RT 对象没换、已注入材质手里的引用仍指向当前那张 depthTexture。
{
  const rtBefore = adapter.shadow.rt;
  const texBefore = adapter.shadow.rt.depthTexture;
  const matBefore = adapter.shadow.matrix;

  // 拿一个"探针材质"手动跑一遍 onBeforeCompile，抓住材质真正拿到的那些引用
  const probeMat = new THREE.MeshStandardMaterial();
  const first = adapter.injectMaterial(probeMat);
  const again = adapter.injectMaterial(probeMat);
  check('injectMaterial 首次返回 true、重复返回 false', first === true && again === false);

  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_end>',
  };
  probeMat.onBeforeCompile(shader);
  const heldMap = shader.uniforms.charShadowMap.value;
  const heldMatrix = shader.uniforms.charShadowMatrix.value;
  const heldRadius = shader.uniforms.charShadowRadius;
  const heldBias = shader.uniforms.charShadowBias;

  const charB = makeCharacter(5, -4, new THREE.MeshStandardMaterial({ color: 0x4444cc }));
  adapter.attachCharacter(charB);
  adapter.update();

  check('换角色后 RT 还是同一个对象', adapter.shadow.rt === rtBefore);
  check('换角色后 depthTexture 还是同一张', adapter.shadow.rt.depthTexture === texBefore);
  check('已注入材质手里的 map 引用仍指向当前那张图（老材质不会采样过期图）',
    heldMap === adapter.shadow.rt.depthTexture);
  check('矩阵对象也没被换掉（uniform 里存的是引用，重建就会脱钩）',
    heldMatrix === matBefore && heldMatrix === adapter.shadow.matrix);
  check('半径 / 偏移 uniform 是共用对象（滑块改一处全生效）',
    heldRadius === adapter.shadow._radiusUniform && heldBias === adapter.shadow._biasUniform);

  let bOk = true;
  charB.traverse((o) => { if (o.isMesh && o.castShadow) bOk = false; });
  check('新角色也被关掉 castShadow', bOk);
  adapter.update();
  check('换角色后影子跟着新角色走', adapter.probe().count > 0,
    `count=${adapter.probe().count}`);

  // 换回去，后面的检查用 charA 的位姿
  adapter.attachCharacter(charA);
  adapter.update();
}

// ── 8. 偏移量按世界米换算（太阳压低时不能长痤疮）────────────
// 归一化深度偏移写死的话，景深范围一变大，物理偏移就跟着放大 —— 太阳一低
// 影子就整片长痤疮。这里读回 uniform 反算，验证物理量恒定、只有归一化值在变。
{
  const worldBias = () => {
    const { near: n, far: f } = adapter.depthRange;
    return adapter.shadow._biasUniform.value * (f - n);
  };
  const normAtHome = () => adapter.shadow._biasUniform.value;

  adapter.update();
  const b1 = worldBias();
  const v1 = normAtHome();
  const far1 = adapter.depthRange.far;

  // 太阳压到 25° 附近 —— 影子变长，景深范围跟着变大
  sun.position.set(-9, 5, 12);
  adapter.update();
  const b2 = worldBias();
  const v2 = normAtHome();
  const far2 = adapter.depthRange.far;

  check('偏移的**世界米**大小不随太阳高低变', near(b1, 0.024, 1e-9) && near(b2, 0.024, 1e-9),
    `${b1.toFixed(6)}m / ${b2.toFixed(6)}m`);
  check('归一化偏移确实随景深范围变了（不是写死的）', !near(v1, v2, 1e-12) && far2 > far1,
    `归一化 ${v1.toExponential(3)} → ${v2.toExponential(3)}；far ${far1.toFixed(1)} → ${far2.toFixed(1)}m`);

  sun.position.copy(SUN_HOME);
  adapter.update();
}

// ── 9. XR 守卫 ──────────────────────────────────────────────
// VR 下多跑一趟 renderer.render() 会打乱 XR 的 framebuffer 绑定。
// 这条只能在真机上最终确认，但至少能钉死"守卫在，且不推进更新计数"。
{
  const nBefore = adapter.stats().updates;
  const realXr = renderer.xr;
  renderer.xr = { isPresenting: true };
  let threw = null;
  try { adapter.update(); } catch (e) { threw = e; }
  renderer.xr = realXr;
  check('XR 呈现中 update() 不抛', !threw, threw ? String(threw) : '');
  check('XR 呈现中 update() 直接跳过（不推进计数）', adapter.stats().updates === nBefore,
    `${nBefore} → ${adapter.stats().updates}`);
}

// ── 10. 注入出来的 GLSL：乘子只许乘平行光 ────────────────────
// 「夜里路灯下的无光之影」那个缺陷的防回归闸门。
//
// 为什么必须在这里钉**源码**而不是等像素：这个最小宿主里**一盏点光都没有**，
// 所以上面 32 条全绿也完全可能带着那个缺陷跑（第一版就是这样活下来的）。
// 像素级的结论要在一个能逐帧 A/B 的环境里量（见 VERIFICATION.md 第一节）：
// 白天受影响>0（乘子还活着），夜里 21.5h 必须 受影响=0px（不再吃街灯）。
// 这里只钉最便宜、最根本的一条：**两个快照存在、顺序对、乘的不是整块**。
{
  const probeMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  adapter.shadow.inject(probeMat);

  // 注入是往 onBeforeCompile 上**挂**，所以从外面再包一层就能拿到最终源码。
  // 直接读 probeMat.onBeforeCompile 的源码文本是不行的 —— 那里面是模板字符串，
  // 变量还没代进去（展开 chunk 那步是在真正编译时才跑的）。
  const inner = probeMat.onBeforeCompile;
  let captured = null;
  probeMat.onBeforeCompile = function (shader) {
    inner.call(this, shader);
    captured = shader.fragmentShader;
  };

  const probeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), probeMat);
  scene.add(probeMesh);
  renderer.compile(scene, camera);
  scene.remove(probeMesh);

  // 去掉注释再断言：那段 GLSL 的**注释里**就写着旧写法当反例，
  // 不剥掉的话"不含旧写法"这条会被自己的注释判失败
  const fs = (captured ?? '').replace(/\/\/[^\n]*/g, '');
  const iBefore = fs.indexOf('charShadowNonDirDiffuse = reflectedLight.directDiffuse');
  const iAfter = fs.indexOf('charShadowDirDiffuse = reflectedLight.directDiffuse - charShadowNonDirDiffuse');

  check('注入的片段着色器里取到了平行光份额的前后两次快照',
    !!captured && iBefore >= 0 && iAfter >= 0,
    captured ? `前=${iBefore} 后=${iAfter}` : '没抓到源码（renderer.compile 没编译这个材质？）');
  check('快照顺序对（先记非平行光份额，再做差得平行光份额）',
    iBefore >= 0 && iBefore < iAfter);
  check('乘子只乘平行光份额，不是整块 directDiffuse',
    fs.includes('charShadowNonDirDiffuse + charShadowDirDiffuse * cs') &&
    !fs.includes('reflectedLight.directDiffuse *= cs;'));
  check('lights_fragment_begin 已就地展开（否则两个快照不在同一作用域，编译会报未定义）',
    !!captured && !fs.includes('#include <lights_fragment_begin>'));
}

// ── 11. 手工换材质 ≡ overrideMaterial（蒙皮 / 实例化两个形状）──
// `update()` 为了不再遍历整棵场景，改成"只传角色子树 + **手工**把材质换成深度材质"。
// 这个最小宿主里的角色是个普通 `Mesh`，覆盖不到**接进宿主后**一定会踩的两个形状：
//   · **SkinnedMesh** —— 宿主角色通常就是 glTF 骨骼动画。蒙皮靠 `object.isSkinnedMesh`
//     推出的 `USE_SKINNING` define 加骨架纹理，材质换得不对，它会**悄悄退回绑定
//     姿势** —— 不报错、不警告，只是姿势不对
//   · **InstancedMesh** —— 实例矩阵在 `object.instanceMatrix` 上，与材质无关
// 判据是"两条路渲出来的图**逐像素相同**"，不是"看着差不多"。
//
// 下面 `renderTheOldWay` 是**刻意保留的参照物**，不是忘了删的死代码。
{
  const probeOf = () => { const p = adapter.probe(); return `${p.count}/${p.deepest}`; };

  /** **上一版**的写法：`scene.overrideMaterial` + 传整个 scene */
  const renderTheOldWay = () => {
    const sh = adapter.shadow;
    sh._clearNow();                    // 与 update() 里是同一段清理
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    scene.overrideMaterial = sh._depthMaterial;
    scene.background = null;
    renderer.render(scene, sh.cam);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
  };

  const abOn = (label, makeRoot) => {
    // 旧写法是靠**相机图层**从整个场景里筛出角色的。前面几节挂过的角色
    // （charA / charB）、以及上一轮 abOn 留下的那个 root，子树都还开着 LAYER ——
    // 不清掉的话旧写法会把它们一起画进来，两条路画的不是同一批东西，比对就没意义。
    // （"不用筛"正是新写法的好处，但比对时必须先把条件拉平。）
    scene.traverse((o) => o.layers.disable(CharacterShadowAdapter.LAYER));

    const root = makeRoot();
    scene.add(root);
    adapter.attachCharacter(root);      // LAYER 重新开在 root 子树上
    adapter.update();
    const nowWay = probeOf();

    // 材质放回去了吗 —— 放不回去，角色会顶着深度材质进主渲染（整块灰）
    let leaked = 0;
    root.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.includes(adapter.shadow._depthMaterial)) leaked++;
    });
    check(`update() 之后材质已放回原引用（${label}）`, leaked === 0, `残留 ${leaked} 处`);

    renderTheOldWay();
    const oldWay = probeOf();
    check(`手工换材质 ≡ overrideMaterial，逐像素相同 —— ${label}`, nowWay === oldWay,
      `新=${nowWay} 旧=${oldWay}`);
  };

  // 蒙皮：骨骼摆到**远离绑定姿势**的位置。不摆开的话，"蒙皮失效退回绑定姿势"
  // 和"蒙皮正常"渲出来是同一张图，这条断言就等于没测。
  abOn('SkinnedMesh', () => {
    const geo = new THREE.BoxGeometry(0.8, 2, 0.8, 2, 6, 2);
    const pos = geo.attributes.position;
    const si = [];
    const sw = [];
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) + 1) / 2, 0, 1); // 0=底 1=顶
      si.push(0, 1, 0, 0);
      sw.push(1 - t, t, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

    const g = new THREE.Group();
    const b0 = new THREE.Bone();
    b0.position.set(0, -1, 0);
    const b1 = new THREE.Bone();
    b1.position.set(0, 1, 0);
    b0.add(b1);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x44cc88 }));
    g.add(mesh);
    mesh.add(b0);
    mesh.bind(new THREE.Skeleton([b0, b1]));  // 绑定姿势 = 竖直
    b1.rotation.z = 1.2;                      // 之后才摆开
    g.updateMatrixWorld(true);
    return g;
  });

  abOn('InstancedMesh', () => {
    const g = new THREE.Group();
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 1.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcc8844 }), 3
    );
    const m4 = new THREE.Matrix4();
    [-1, 0.15, 1.05].forEach((x, i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.6, 0)));
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
    return g;
  });

  // 角色被藏起来（第一人称 / 过场动画）时**不该还有影子**。
  //
  // 这里藏的是角色的**祖先**、不是角色自己 —— three 的 `projectObject` 是
  // "父节点 `visible === false` 就剪掉整棵子树"，从场景根开始遍历时这条自动成立；
  // 改成只遍历角色子树之后就少了这一环，所以才要 `_effectivelyVisible()`
  // 自己走一遍父链。只判 `character.visible` 的写法在这里会漏（父看不见，子照样被画）。
  {
    scene.traverse((o) => o.layers.disable(CharacterShadowAdapter.LAYER));
    const wrapper = new THREE.Group();
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.7, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xaa5555 })
    );
    body.position.y = 0.85;
    g.add(body);
    wrapper.add(g);
    scene.add(wrapper);
    adapter.attachCharacter(g);          // 角色是 g，wrapper 是它的祖先

    adapter.update();
    const shown = probeOf();
    wrapper.visible = false;
    adapter.update();
    const hidden = probeOf();
    wrapper.visible = true;
    adapter.update();

    check('祖先被隐藏时图里没有占位（父链可见性会剪掉整棵子树）',
      !shown.startsWith('0/') && hidden.startsWith('0/'), `可见=${shown} 祖先隐藏=${hidden}`);
  }

  // `update()` 不该再碰 scene 的状态。以前要临时改 overrideMaterial / background
  // 再改回来 —— 那是"改完忘了还"的经典出错点；而且传 scene 会连带触发宿主的
  // `scene.onBeforeRender`，拿它驱动 CSM 的宿主就被多调了一次。
  scene.overrideMaterial = null;
  scene.background = null;
  let sceneHooks = 0;
  const realOnBefore = scene.onBeforeRender;
  scene.onBeforeRender = () => { sceneHooks++; };
  adapter.update();
  scene.onBeforeRender = realOnBefore;
  check('update() 不触发 scene.onBeforeRender（宿主用它驱动 CSM 时不会被多调一次）',
    sceneHooks === 0, `被调了 ${sceneHooks} 次`);
  check('update() 不改动 scene.overrideMaterial / background（不再有要还回去的状态）',
    scene.overrideMaterial === null && scene.background === null);
}

// ── 输出 ────────────────────────────────────────────────────
const pre = document.createElement('pre');
pre.id = 'out';
pre.textContent = out.join('\n') + `\n\n合计 ${pass} 通过 / ${fail} 失败`;
document.body.appendChild(pre);
