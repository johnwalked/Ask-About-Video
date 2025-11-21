import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    // Base URL is set to relative './' to ensure assets load correctly 
    // regardless of the repository name (e.g. user.github.io/repo-name/)
    base: './', 
    define: {
      // Securely map the environment variable to the process.env object expected by the app
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});