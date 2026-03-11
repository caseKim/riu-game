import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

const version = Date.now().toString()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-file',
      buildStart() {
        writeFileSync('public/version.json', JSON.stringify({ v: version }))
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
