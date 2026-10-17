# 夜行赛车 Night Racer

浏览器里直接玩的 3D 赛车游戏，手机和电脑都能玩。

**在线试玩：https://night-racer.pages.dev**

## 地图

霓虹街区（雨夜）· 雾岭山道（黄昏）· 碧海长桥（晴天）· 长安灯火（元宵夜）· 天空工地 · 赤岩峡谷 · 云港城区（岔路）· 珊瑚深海 · 冰原极光（雪夜）· 巨像遗迹（苔藓古林，在建中）· 坠梦，还有一张要倒着开才能找到的隐藏地图。

支持对战 AI、计时赛（挑战自己的幽灵车）、联机房间、排行榜、车库改装。

## 技术

- [Three.js](https://threejs.org) 渲染，esbuild 打包成一个网页文件，部署在 Cloudflare Pages
- 大部分场景用代码生成：地形、天空、赛道、建筑
- 冰原极光的场景物件和 GT 车模型是用 [Tripo](https://www.tripo3d.ai) AI 生成的 3D 模型，再用 Blender 脚本减面、烘焙法线、压缩

## 目录

| 路径 | 内容 |
|---|---|
| `src/` | 游戏代码。`main.js` 主循环，`car.js` 车辆物理，`track.js` 赛道，`maps.js` 地图定义，其余每个文件是一张地图的场景 |
| `public/models/` | 3D 模型（`gt.glb` 赛车，`ice.glb` 冰原场景） |
| `tools/tripo.mjs` | 调用 Tripo API 生成模型（需要自己的 API key，放在 `~/.config/tripo/api-key`） |
| `tools/pack-assets.py` | Blender 脚本：把生成的模型打包、缩小贴图 |
| `tools/gt-model.py` | Blender 脚本：把 Tripo 的车拆出轮子、减面、烘焙法线 |
| `tools/track-layout.mjs` | 用直道和弯道拼出闭合赛道 |
| `functions/` | Cloudflare Pages Functions，转发联机和排行榜请求 |

排行榜和联机房间的服务器代码没有放在这里。

## 本地运行

```bash
npm install
node build.mjs          # 生成 dist/index.html
cd dist && python3 -m http.server 8000
```

然后打开 http://localhost:8000 。本地运行时联机和排行榜用不了，比赛照常能玩。

## 许可证

[MIT](LICENSE)：可以随意使用、修改、再发布，保留原来的版权声明就行。`public/models/` 里的 3D 模型也一样适用。

## 求助：森林地图的草看起来"悬空"

巨像遗迹（`src/colossus.js`）用 Tripo 模型、代码生成的针叶、实例化草丛搭了一片古林，但草和地面始终显得是两层、草像浮在地上。已经试过：

- 让地形高度查找和网格三角形一致（`hAt`），草和倒木贴地
- 路面和路肩共用同一张 Poly Haven 泥土照片，路边磨损破边
- 草根变暗、地面调暖，草铺满到路边

仍然不对劲。欢迎看 `src/colossus.js` 的路肩（`OFF` 数组附近）、草丛（`grass_tuft` 和"real grass"两段）和光照部分，给点思路：是缺接触阴影/AO、草和地的色调、还是别的原因？

另一个待做：巨像的手臂想做成赛道本体（车沿手臂爬坡、从手掌飞出），但 Tripo 模型比例太粗短，压扁会变形，欢迎出主意。

模型在 `public/models/`，打包脚本在 `tools/`。游戏本身 `npm install && npm run build` 后用任意静态服务器打开 `dist/index.html` 即可玩（选"巨像遗迹"、画质"极致"）。
