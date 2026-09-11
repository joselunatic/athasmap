import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtlasServer } from "./server.mjs";

const servers: Array<ReturnType<typeof createAtlasServer>> = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function api() {
  const directory = await mkdtemp(join(tmpdir(), "athas-api-"));
  directories.push(directory);
  const server = createAtlasServer({
    password: "wayan",
    publicDir: directory,
    statePath: join(directory, "state.json"),
  });
  servers.push(server);
  const url = await server.listen();
  return `${url}/api/state`;
}

describe("API de campaña", () => {
  it("permite leer una campaña aún sin guardar", async () => {
    const response = await fetch(await api());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 0, state: null });
  });

  it("exige contraseña y conserva el estado compartido", async () => {
    const url = await api();
    const body = {
      revision: 0,
      state: { version: 1, coordinateSystem: "athas-image-normalized-v1", pois: [] },
    };
    expect((await fetch(url, { method: "PUT", body: JSON.stringify(body) })).status).toBe(401);
    expect(
      (
        await fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/json", "x-atlas-password": "wayan" },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(200);
    expect(await (await fetch(url)).json()).toEqual({ revision: 1, state: body.state });
  });

  it("rechaza una escritura con una revisión obsoleta", async () => {
    const url = await api();
    const body = JSON.stringify({
      revision: 0,
      state: { version: 1, coordinateSystem: "athas-image-normalized-v1", pois: [] },
    });
    const options = { method: "PUT", headers: { "content-type": "application/json", "x-atlas-password": "wayan" }, body };
    await fetch(url, options);
    expect((await fetch(url, options)).status).toBe(409);
  });
});

describe("Archivos estáticos", () => {
  async function serve() {
    const directory = await mkdtemp(join(tmpdir(), "athas-static-"));
    directories.push(directory);
    await mkdir(join(directory, "cities"), { recursive: true });
    await mkdir(join(directory, "assets"), { recursive: true });
    await writeFile(
      join(directory, "cities", "tyr.jpg"),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
    await writeFile(join(directory, "assets", "app-1234.js"), "export {};");
    const server = createAtlasServer({
      password: "wayan",
      publicDir: directory,
      statePath: join(directory, "state.json"),
    });
    servers.push(server);
    return await server.listen();
  }

  it("sirve las imágenes de ciudad como image/jpeg y con caché revalidable", async () => {
    const response = await fetch(`${await serve()}/cities/tyr.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600, must-revalidate",
    );
  });

  it("mantiene inmutables los assets con hash", async () => {
    const response = await fetch(`${await serve()}/assets/app-1234.js`);
    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});
