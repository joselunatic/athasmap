import { resolve } from "node:path";
import { createAtlasServer } from "./server.mjs";

const server = createAtlasServer({
  password: process.env.ATLAS_ADMIN_PASSWORD,
  publicDir: resolve(process.env.ATLAS_PUBLIC_DIR ?? "dist"),
  statePath: resolve(process.env.ATLAS_STATE_PATH ?? "data/campaign.json"),
});

server.server.listen(process.env.PORT ?? 80, "0.0.0.0");
