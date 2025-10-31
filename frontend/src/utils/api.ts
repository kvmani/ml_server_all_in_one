export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !payload) {
    throw new Error("Request failed");
  }
  if (!payload.success) {
    const message = payload.error?.message || "Request failed";
    throw new Error(message);
  }
  if (payload.data === undefined) {
    throw new Error("Malformed API response");
  }
  return payload.data;
}
