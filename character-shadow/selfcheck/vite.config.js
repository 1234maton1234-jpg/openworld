// 自检页的构建配置：把它打成**只含自检页 + three 的离线单页**，
// 不碰宿主工程里的任何构建配置。
//
//   cd character-shadow/selfcheck
//   npm i
//   npm run build      # → dist/adapter-check.html + dist/assets/*.js
//   npm run preview    # 起静态服务器打开它
//
// 如果你已经把本模块接进了自己的工程，用你们自己的入口跑那两个源文件也行
// （见 adapter-check.html 顶部注释第 2 种跑法）。这个 config 的作用是**只**打自检页。
//
// `base: './'` 不能省：省了产物里是绝对路径 `/assets/...`，放到子目录就 404。

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: fileURLToPath(new URL('./adapter-check.html', import.meta.url)),
    },
  },
});
