import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Must match LOCAL_DEV_ORIGIN in infra/lib/stacks/stateless-stack.ts.
  server: { port: 5173, strictPort: true },
});
