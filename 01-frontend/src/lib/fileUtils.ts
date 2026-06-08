import { tokenStore } from "./tokenStore";

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadFile(docId: string, fileName: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`/api/files/${docId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Téléchargement échoué (${response.status})${text ? `: ${text}` : ""}`);
  }

  triggerBlobDownload(await response.blob(), fileName);
}

/**
 * Uploads a file to the backend REST endpoint.
 * Returns the created Document metadata.
 * The backend route is POST /api/files/upload (requires auth).
 */
export async function uploadFile(
  file: File,
  options?: { incidentId?: string; category?: string }
): Promise<{ id: string; name: string; mimeType: string; sizeBytes: number; category: string }> {
  const token = tokenStore.get();
  const formData = new FormData();
  formData.append("file", file);
  if (options?.incidentId) formData.append("incidentId", options.incidentId);
  if (options?.category) formData.append("category", options.category);

  const response = await fetch("/api/files/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `Upload échoué (${response.status})`);
  }

  return response.json() as Promise<{ id: string; name: string; mimeType: string; sizeBytes: number; category: string }>;
}

/**
 * Formats a byte count into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
