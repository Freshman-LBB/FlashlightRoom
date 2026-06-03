# 实现说明

记录一下各模块怎么串起来的，方便以后改场景或答辩时翻。

## 架构

每帧：`input` → `camera`（物理碰撞）→ `main.setUniforms` → `drawArrays` 画全屏 quad → 片段着色器里对每个像素发一条射线。

CPU 管 Hero 位置、视角模式、纹理加载；GPU 管 `sceneSDF`、步进求交、法线、光照、阴影、后处理。`scene.js` 和 `shader.js` 里的物体坐标目前是各写一份，加新物体时要两边一起改——这是当时赶工期留下的坑。

## shader.js（核心）

**SDF 原语：** `boxSDF`、`sphereSDF`、`planeSDF`、`mengerSDF`（1 级，20 个小盒子取 min）。

**场景：** `sceneSDF` 对房间六个平面和物体做距离合并（取 min）。房间半边长 `u_roomSize = 20`，底面 Y = -15.5。

**Ray Marching：** 沿射线用 `t += max(d * stepScale, minStep)` 前进，最多 256 步，`eps = 0.001`。阴影光线步进更保守（`stepScale = 0.9`）。

**法线：** 对 `sceneSDF` 做数值差分；靠近墙角时有时会 fallback 到轴对齐法线，减少波纹。

**光照：**

- 环境光强度 0.02
- 聚光灯跟 Hero 走，方向是主视角朝向上偏约 5°，锥角 30°
- 角度分 0°–7.5°、7.5°–18.75°、18.75°–30° 三段线性衰减
- 距离衰减里的 `H` 随角度区间变
- 环境光和聚光按亮度取较大者，避免暗部被错误抬亮
- `isInShadow`：表面点向光源再 march，Hero 在阴影光线上跳过

**体积光：** G 键开关。主 march 循环里每隔 0.05 采样一次强度，累加到 `volumetricIntensity`。

**后处理：** 指数雾、高亮区略强的 Reinhard、gamma 2.2。`u_samples >= 4` 时做 4×4 MSAA（16 次子像素）。

**俯视模式（viewMode 1–4）：** 固定房顶机位，WASD 仍移动 Hero；光源位置画曝光圆；GPU 会画 Hero 立方体（主视角不画，免得挡视线）。

## camera.js

| viewMode | 说明 |
|----------|------|
| 0 | 第一人称，鼠标 yaw/pitch，FOV 60° |
| 1–4 | 房顶四角俯视，IJKL/鼠标 ±45°，滚轮 FOV 30°–120° |

移动方向用 `mainYaw`，俯视时操作习惯和主视角一致。重力 -9.8，跳起初速 8，Hero 碰撞半径 0.3。立方体走 `handleBoxCollision`，球和 fractal 走 `handleSphereCollision`，站在物体上有 `stableStandingY` 防抖。

## 场景物体（当前坐标）

| 物体 | 中心 (x, y, z) | 备注 |
|------|----------------|------|
| 多面立方体 | (-8, -14.5, -8) | half-size 1 |
| 球 | (8, -14.5, -8) | r = 0.8 |
| Menger | (-8, -14.5, 8) | size 2，Z 键可单独显示 |

## main.js

优先 `webgl2`，失败回退 `webgl`。三张纹理绑到单元 0–2。每帧算 `u_lightPosition`、`u_lightDirection` 等聚光 uniform。

## 已知局限

- 16 点 MSAA + 每像素阴影 march，笔记本上容易掉帧
- 光照是漫反射 + 聚光，没有 PBR
- `utils.js` 里的 `mat4LookAt` / `mat4Perspective` 没接到当前射线相机构造里

## 延伸阅读

- https://iquilezles.org/articles/distfunctions/
- https://iquilezles.org/articles/raymarchingdf/
