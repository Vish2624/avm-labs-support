/** Shared SWR fetcher for client-side API reads (Support Workspace, /profiles). */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

/** POST a JSON body to an app API route; throws the route's `error` message on failure. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}
