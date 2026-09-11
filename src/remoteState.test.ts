import { describe, expect, it } from "vitest";
import { initialState } from "./domain";
import { loadRemoteState, RemoteAuthError, saveRemoteState } from "./remoteState";

describe("cliente de campaña remota", () => {
  it("carga una campaña remota validada", async () => {
    const snapshot = { revision: 4, state: initialState() };
    const result = await loadRemoteState(async () => new Response(JSON.stringify(snapshot)));
    expect(result).toEqual(snapshot);
  });

  it("envía la contraseña y traduce una respuesta no autorizada", async () => {
    let request: RequestInit | undefined;
    await expect(
      saveRemoteState(initialState(), 0, "wayan", async (_url, init) => {
        request = init;
        return new Response(JSON.stringify({ error: "Contraseña incorrecta" }), { status: 401 });
      }),
    ).rejects.toBeInstanceOf(RemoteAuthError);
    expect(new Headers(request?.headers).get("x-atlas-password")).toBe("wayan");
  });

  it("migra el formato de viaje antiguo de una campaña remota", async () => {
    const legacy = {
      mode: "foot",
      pace: 2.5,
      hours: 8,
      scale: 1000,
      terrain: "sand",
      heat: true,
      storm: false,
      load: false,
      scarceWater: false,
      useRoad: false,
    };
    const snapshot = { revision: 4, state: { ...initialState(), travel: legacy } };
    const result = await loadRemoteState(async () => new Response(JSON.stringify(snapshot)));
    expect(result.state?.travel.pace).toBe("custom");
    expect(result.state?.travel.customMph).toBe(2.5);
    expect(result.state?.travel).not.toHaveProperty("scale");
  });
});
