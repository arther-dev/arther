import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      'Design/**',
      'Development/**',
      'Features/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // F1.6 follow-up: a type-aware rule enforcing workspace_id on every
      // service-role query slots in here; until then the runtime guard in
      // @arther/db (scopedServiceQuery) is the enforcement point.
      //
      // F8.5 least-privilege responses: never `.select('*')` — every query
      // names the columns it needs so responses can't widen into raw rows.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='select'][arguments.0.value='*']",
          message:
            "Select explicit columns, never .select('*') — least-privilege responses (F8.5).",
        },
      ],
    },
  },
);
