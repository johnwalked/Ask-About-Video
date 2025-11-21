import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, '.', '');
  
  // Prioritize the variable from loadEnv, but fallback to process.env for CI/CD
  const apiKey = env.API_KEY || process.env.API_KEY;

  return {
    plugins: [react()],
    base: './', 
    define: {
      // Securely map the environment variable to the process.env object expected by the app
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
  };
});