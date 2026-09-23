/** Shared SWR fetcher for client-side API reads (Support Workspace, /profiles). */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

