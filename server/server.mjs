import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { extname, join, resolve } from "node:path";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".geojson": "application/geo+json",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function equalPassword(received, expected) {
  const a = Buffer.from(received ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("El contenido supera el límite permitido.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validState(state) {
  return (
    state &&
    typeof state === "object" &&
    state.version === 1 &&
    state.coordinateSystem === "athas-image-normalized-v1" &&
    Array.isArray(state.pois)
  );
}

export function createAtlasServer({ password, publicDir, statePath }) {
  if (!password) throw new Error("ATLAS_ADMIN_PASSWORD es obligatoria.");
  let writeQueue = Promise.resolve();

  async function load() {
    try {
      const raw = JSON.parse(await readFile(statePath, "utf8"));
      if (Number.isInteger(raw.revision) && raw.revision >= 0 && validState(raw.state)) return raw;
      throw new Error("El archivo de campaña no tiene un formato válido.");
    } catch (error) {
      if (error.code === "ENOENT") return { revision: 0, state: null };
      throw error;
    }
  }

  async function save(snapshot) {
    await mkdir(resolve(statePath, ".."), { recursive: true });
    const temporary = `${statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
    await rename(temporary, statePath);
  }

  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/state") {
        if (request.method === "GET") return send(response, 200, await load());
        if (request.method !== "PUT") return send(response, 405, { error: "Método no permitido" });
        if (!equalPassword(request.headers["x-atlas-password"], password))
          return send(response, 401, { error: "Contraseña incorrecta" });
        const body = await readBody(request);
        if (!Number.isInteger(body?.revision) || !validState(body.state))
          return send(response, 400, { error: "Campaña no válida" });
        const operation = writeQueue.then(async () => {
          const current = await load();
          if (body.revision !== current.revision) return send(response, 409, { error: "La campaña ha cambiado" });
          const next = { revision: current.revision + 1, state: body.state };
          await save(next);
          return send(response, 200, next);
        });
        writeQueue = operation.catch(() => undefined);
        return operation;
      }
      if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, { error: "Método no permitido" });
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const candidate = resolve(publicDir, `.${requested}`);
      const filePath = candidate.startsWith(resolve(publicDir)) ? candidate : resolve(publicDir, "index.html");
      let content;
      try {
        content = await readFile(filePath);
      } catch {
        content = await readFile(join(publicDir, "index.html"));
      }
      const extension = extname(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
        "cache-control": extension === ".html" ? "no-cache" : "public, max-age=2592000, immutable",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Error interno" });
    }
  });

  return {
    close: () => new Promise((resolveClose) => httpServer.close(resolveClose)),
    listen: () =>
      new Promise((resolveListen) => {
        httpServer.listen(0, "127.0.0.1", () => {
          const address = httpServer.address();
          resolveListen(`http://127.0.0.1:${address.port}`);
        });
      }),
    server: httpServer,
  };
}
