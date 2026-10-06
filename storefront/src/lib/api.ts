// Server-side fetch helper (server components only). Talks straight to the .NET API.
const API_URL = process.env.API_URL ?? 'http://localhost:5080';

export async function apiGet<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // API unreachable: pages render an empty state instead of crashing
  }
}
