import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The React Compiler set-state-in-effect rule fires on legit
      // sync-state-from-query patterns we use across the admin pages.
      // Downgrade to a warning so CI doesn't block, but it still surfaces
      // in editor output.
      'react-hooks/set-state-in-effect': 'warn',
      // auth.tsx mixes the AuthProvider component with the hook exports
      // (useAuth, useMyEmployee, useMyRoles). Splitting is a separate
      // refactor; treat as a warning for now.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
