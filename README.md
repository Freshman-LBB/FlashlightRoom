# FlashlightRoom

浏览器里跑的一个小手电筒密室 demo。画面不是常规 mesh 光栅化，而是在 WebGL 片段着色器里对像素做 Ray Marching，场景几何用 SDF 描述。没有用 Three.js 之类引擎，JS 这边主要管输入、相机和碰撞，渲染和光照都在 GLSL 里完成。

课程图形学大作业时写的，后来把代码整理了一下方便自己回看和演示。

## 运行

需要本地 HTTP 服务（直接双击 html 会因为纹理跨域加载失败）。

**Windows：** 双击 `start.bat`，浏览器打开 http://localhost:8000

**其他环境：**

```bash
# 在项目根目录执行
python -m http.server 8000
# 或
npx http-server -p 8000
```

进页面后点一下 canvas，锁定鼠标才能用第一人称视角。

## 操作

| 按键 | 作用 |
|------|------|
| W A S D | 移动（水平面） |
| 空格 | 跳跃 |
| 鼠标 | 主视角转头 |
| 1 ~ 4 | 房顶四个俯视机位 |
| 5 | 回到主视角 |
| I K J L | 俯视时转相机 |
| 滚轮 | 俯视时调 FOV |
| G | 开关体积光 |
| Z | 开关 Menger 海绵 |

## 目录

```
├── index.html      页面和 HUD
├── main.js         WebGL 初始化、纹理、渲染循环
├── shader.js       顶点/片段着色器（Ray Marching 主体）
├── scene.js        场景物体参数（和 shader 里位置对应）
├── camera.js       多视角、重力、碰撞
├── input.js        键盘鼠标
├── utils.js        向量矩阵工具
├── assets/         墙地顶纹理
└── start.bat       本地服务器
```

更细的实现说明见 [docs/implementation.md](docs/implementation.md)。

## 技术概要

- WebGL 1/2，全屏四边形 + 片元着色器逐像素求交
- SDF：房间六面、彩色立方体、球体、一级 Menger 海绵
- 聚光灯光照（分段角度衰减 + 距离衰减）、Shadow Ray Marching
- 可选体积光、雾、Reinhard + gamma、4×4 MSAA

参考过 [Inigo Quilez](https://iquilezles.org/) 的距离函数和 ray marching 文章。

## 环境

Chrome / Edge / Firefox 等支持 WebGL 的浏览器即可。机器性能一般时全屏 + MSAA 会比较吃力，属于预期现象。
