import { defineConfig } from 'vite';

// GitHub Pages는 https://iriskoo0214.github.io/bouquet_3dwebsite/ 아래에서 열린다.
// 빌드할 때만 이 경로를 앞에 붙이고, 로컬 개발(npm run dev)은 그대로 / 를 쓴다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bouquet_3dwebsite/' : '/',
}));
