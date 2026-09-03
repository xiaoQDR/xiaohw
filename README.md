# xiaohw / 小黑屋

本仓库包含两个相互独立的版本：

| 目录 | 内容 |
| --- | --- |
| [`legacy/`](./legacy/) | 原始 A Dark Room JavaScript / jQuery 源码，完整保留供对照 |
| [`phaser/`](./phaser/) | Phaser 3 + TypeScript 重构版，可直接开发和构建 Web |

## Phaser 版

```bash
cd phaser
npm install
npm run dev
```

生产构建：

```bash
cd phaser
npm ci
npm run build
```

每次提交到 `main`，GitHub Actions 会自动：

1. 安装锁定依赖并执行 TypeScript 检查；
2. 构建 `phaser/dist/`；
3. 上传 `xiaohw-web` 构建包；
4. 部署到 GitHub Pages。

## 许可

原始版本及其资源的许可见 [`legacy/LICENSE.md`](./legacy/LICENSE.md)。Phaser 重构代码延续 MPL-2.0。
