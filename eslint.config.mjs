// 루트 공용 ESLint 설정 (flat config).
// Backend/Frontend 의 lint 스크립트가 각 워크스페이스에서 실행해도
// ESLint 가 상위 폴더로 올라가 이 파일을 찾습니다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'vault/**', 'data/**', 'workspace/**', 'Backend/data/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['Backend/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['Frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
