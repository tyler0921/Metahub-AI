import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const resolvePath = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': resolvePath('./src'),
        '@shared': resolvePath('../shared/src/index.d.ts'),
      },
    },

    server: {
      port: 5173,
      strictPort: false,
      // 개발 중에는 프록시를 태워 CORS 없이 같은 오리진처럼 쓴다.
      // (VITE_API_BASE_URL 을 지정하면 프록시 대신 그 주소를 직접 호출)
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        // 코드형 산출물(랜딩페이지 등)을 iframe 으로 띄우는 경로.
        // 백엔드가 정적으로 서빙하므로 /api 와 같은 방식으로 넘깁니다.
        '/workspace': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      fs: {
        // shared 패키지가 Frontend 폴더 바깥에 있으므로 접근을 허용
        allow: ['..'],
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
    },
  };
});
