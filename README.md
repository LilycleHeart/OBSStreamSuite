# OBS 播放组件

BetterNCM 插件，统一管理 OBS 歌曲信息、封面柔光、动态柱条和小词栏，使用 Material You 配色。

## 安装要求

- Windows、网易云音乐 2.10.x、BetterNCM 1.0+。
- RefinedNowPlaying 和 MaterialYouTheme；市场安装会检查这些依赖。
- **Node.js 20+**，用于本机连接服务。请从 [Node.js 官方网站](https://nodejs.org/) 安装。
- 安装此整合版前，停用或卸载 LyricBar、旧 OBSNowPlaying，避免软件内词栏重复。

将 `.plugin` 包导入 BetterNCM 并重启网易云，在设置中打开“OBS 播放组件”。首次启动会在 BetterNCM 数据目录下建立 `lyricbar-obs`，生成本机密钥并静默启动 Node 服务。**不下载可执行文件，不要求管理员权限。**

若 Node.js 尚未安装，安装后点击“启动 / 检查连接”，或重新打开网易云。插件启用时服务自动启动，无需单独注册 Windows 登录启动项。

## OBS 浏览器源

| 内容 | 默认地址 | 推荐尺寸 |
| --- | --- | --- |
| 歌曲信息 | `http://127.0.0.1:17891/nowplaying` | 500 × 200 |
| 小词栏 | `http://127.0.0.1:17891/overlay` | 500 × 420 |

启用“不显示时关闭源”。网页透明；播放器主体在 500px 宽度下占 452px，其余空间留给光晕。

词栏短句自适应收窄，最大宽度默认跟随播放器；长句达到上限后换行向上展开。420px 高度为透明预留区，实际底边固定。支持中文逐字歌词、翻译与长英文单词。宽高形变默认 500ms，暂停淡出默认 220ms。

换句沿用宿主的 500ms 上下滚动过渡，按每句换行后的实际高度排列前后句。选句和逐字进度直接跟随网易云的播放进度事件；OBS 不自行推进歌词时间。尺寸只在句子、字体、设置或窗口大小变化时测量，逐字运动不会重复测量。

设置页可分别调整歌曲卡片、封面与小词栏的圆角（0–100px；0 为直角），保存后同步到 OBS。默认值分别为 10px、9px、16px，保留原有外观。

切歌时，歌曲组件淡出旧内容并轻微上移，预加载新封面后淡入新歌曲；小词栏先淡出旧歌词，再显示新歌。连续切歌只显示最后一首，暂停或隐藏会结束待完成的切歌过渡，避免旧数据再次显现。

OBS 词栏显示后，软件内词栏停止渲染；源隐藏或断开后恢复。两个组件共用 Material You 动态色板。封面为静态柔光；柱条是**播放状态驱动的动画效果，不是实时音频 FFT**，帧率可选 10/15/20/30 FPS，暂停和隐藏时停止。

## 数据与服务

服务仅监听 `127.0.0.1`。只同步当前歌曲元数据、歌词、播放时间与相关主题设置。封面由浏览器从原始图片地址加载；插件不提供播放音频，不采集麦克风，不启动 OBS 直播或录制。

每次安装独立生成连接密钥，保存在本机 `lyricbar-obs/bridge-config.json`。公开源码和安装包不含个人连接密钥或用户配置。

插件关闭或卸载后，客户端不再发布数据。已经运行的 Node 服务可能继续空闲运行至进程退出；可关闭对应 `lyricbar-obs/bridge-server.cjs` 进程。原有偏好存储键保留，兼容本地版本迁移。

## 构建

```sh
npm ci
npm run build
npm test
```

市场打包目录为 `dist/`，提交的产物可由本仓库原始源码重建。GitHub Actions 会执行构建和认证/生命周期测试。仅在网易云 2.10.13 与 OBS 29.1.3 / CEF 103 环境进行过客户端测试；不声明支持网易云 3.x。

## 来源与许可证

软件内词栏和设置界面基于 [solstice23/lyric-bar-netease](https://github.com/solstice23/lyric-bar-netease)，部分歌词样式与渲染逻辑基于 [RefinedNowPlaying](https://github.com/solstice23/refined-now-playing-netease)。原始 MIT 许可与作者署名保留在 `licenses/` 和 `vendor/lyric-bar/LICENSE`。

本项目采用 MIT。React、ReactDOM、ws 的许可证随插件打包。反馈请使用 [GitHub Issues](https://github.com/LilycleHeart/OBSPlaybackSuite/issues)。
