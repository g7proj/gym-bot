import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Lightweight ESLint 9 rule that marks JSX component identifiers (`<Comp />`, `<Obj.Comp />`) as used.
const jsxUsesVarsPlugin = {
  rules: {
    'jsx-uses-vars': {
      create(context) {
        return {
          JSXOpeningElement(node) {
            let target = node.name;
            while (target && target.type === 'JSXMemberExpression') {
              target = target.object;
            }
            if (target && target.type === 'JSXIdentifier') {
              context.sourceCode.markVariableAsUsed(target.name, node);
            }
          },
        };
      },
    },
  },
};

export default [
  { ignores: ['build/**', 'dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-vars': jsxUsesVarsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'jsx-vars/jsx-uses-vars': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
