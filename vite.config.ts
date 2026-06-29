import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Served at the root of its own subdomain (ankibot.ryanbohluli.com),
// so base is '/'. See public/CNAME and .github/workflows/deploy.yml.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { port: 3000 },
})
