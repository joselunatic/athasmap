import { z } from "zod";
import { stateSchema, type AtlasState } from "./domain";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RemoteSnapshot = { revision: number; state: AtlasState | null };

export class RemoteAuthError extends Error {}
export class RemoteConflictError extends Error {}
export class RemoteStateError extends Error {}

const snapshotSchema = z.object({
  revision: z.number().int().min(0),
  state: stateSchema.nullable(),
});

async function errorFor(response: Response) {
  const message = await response
    .json()
    .then((body: unknown) =>
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : "Error de servidor",
    )
    .catch(() => "Error de servidor");
  if (response.status === 401) return new RemoteAuthError(message);
  if (response.status === 409) return new RemoteConflictError(message);
  return new RemoteStateError(message);
}

export async function loadRemoteState(fetcher: Fetcher = fetch): Promise<RemoteSnapshot> {
  const response = await fetcher("/api/state", { headers: { accept: "application/json" } });
  if (!response.ok) throw await errorFor(response);
  return snapshotSchema.parse(await response.json());
}

export async function saveRemoteState(
  state: AtlasState,
  revision: number,
  password: string,
  fetcher: Fetcher = fetch,
): Promise<RemoteSnapshot> {
  const response = await fetcher("/api/state", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-atlas-password": password,
    },
    body: JSON.stringify({ revision, state: stateSchema.parse(state) }),
  });
  if (!response.ok) throw await errorFor(response);
  return snapshotSchema.parse(await response.json());
}
