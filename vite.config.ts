import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Expose only known immutable map assets, without copying 33 MB of reference art.
function atlasAssets(): Plugin {
  return {
    name: "atlas-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!/^\/tiles_new\/[0-5]\/\d+\/\d+\.png$/.test(url))
          return next();
        const stream = createReadStream(resolve(".", url.slice(1)));
        stream.on("error", () => {
          res.statusCode = 404;
          res.end("Asset unavailable");
        });
        res.setHeader("Content-Type", "image/png");
        stream.pipe(res);
      });
    },
    async closeBundle() {
      await mkdir("dist/tiles_new", { recursive: true });
      for (let z = 0; z <= 5; z++)
        await cp(`tiles_new/${z}`, `dist/tiles_new/${z}`, { recursive: true });
    },
  };
}
export default defineConfig({ plugins: [react(), atlasAssets()] });
