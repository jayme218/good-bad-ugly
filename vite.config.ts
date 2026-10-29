import { readFile } from 'node:fs/promises'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

function editionAsset(): Plugin {
  const source = new URL('./src/data/today.json', import.meta.url)
  return {
    name: 'current-edition',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'edition.json', source: await readFile(source, 'utf8') })
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (path !== '/edition.json' && path !== `${server.config.base}edition.json`) return next()
        try {
          const data = await readFile(source, 'utf8')
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(data)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), editionAsset()],
})
