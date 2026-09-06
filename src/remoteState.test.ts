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
});
