// Server-side fetch helper (server components only). Talks straight to the .NET API.
const API_URL = process.env.API_URL ?? 'http://localhost:5080';

export async function apiGet<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    // An empty body (a 200 with no content) must not crash the page either.
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null; // API unreachable or returned something that is not JSON: empty state instead of a crash
  }
}
