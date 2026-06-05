# Vitest Allure Support

Specwright ships a reusable Vitest reporter base at `vitest/vitest.base.ts`.

Use it from your existing Vitest config:

```ts
import { mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.base';

export default mergeConfig(baseConfig, {
  test: {
    environment: 'jsdom',
  },
});
```

Allure results are written to `test-results/allure/results` and opened with:

```sh
npm run test:report
```
