/**
 * MoodFit — Isomorphic API Client
 * next-frontend/utils/api.ts
 */

import { MoodPredictInput, LoginInput } from "./schemas";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = "Something went wrong.";
    try {
      const data = await res.json();
      errorMsg = data.detail || data.message || errorMsg;
    } catch {
      // ignore
    }
    throw new ApiError(errorMsg, res.status);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

export const moodFitApi = {
  // 1. Predict aesthetic match
  predict: (input: MoodPredictInput) =>
    request<any>("/predict", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // 2. Auth Actions
  login: (input: LoginInput) =>
    request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  register: (input: LoginInput) =>
    request<any>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  logout: () =>
    request<any>("/auth/logout", {
      method: "POST",
    }),

  // 3. User History
  history: () => request<any[]>("/history"),

  // 4. Wardrobe Actions
  uploadWardrobe: (formData: FormData) =>
    request<any>("/wardrobe/upload", {
      method: "POST",
      headers: {
        // Fetch auto-binds content-type boundary during FormData streams
        "Content-Type": "none-sentinel",
      },
      // Override boundary setting
      body: formData,
    }).catch(async (err) => {
      // Standard fetch with FormData overrides manual boundary config
      // Hack boundary headers bypass
      const rawRes = await fetch(`${API_BASE}/wardrobe/upload`, {
        method: "POST",
        body: formData,
      });
      if (!rawRes.ok) throw new Error("File upload failed.");
      return rawRes.json();
    }),

  getBatchStatus: (batchId: string) =>
    request<any>(`/wardrobe/status/${batchId}`),

  getWardrobeItems: (page = 1, limit = 20) =>
    request<any>(`/wardrobe/items?page=${page}&limit=${limit}`),

  deleteWardrobeItem: (itemId: string) =>
    request<any>(`/wardrobe/items/${itemId}`, {
      method: "DELETE",
    }),

  getWardrobeStats: () => request<any>("/wardrobe/stats"),
};
