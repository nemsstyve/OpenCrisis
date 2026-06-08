import { tokenStore } from "./tokenStore";
import { triggerBlobDownload } from "./fileUtils";

async function fetchExport(url: string, errorPrefix: string): Promise<Blob> {
  const token = tokenStore.get();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `${errorPrefix} (${response.status})`);
  }
  return response.blob();
}

export async function exportPdf(incidentId: string, incidentName: string): Promise<void> {
  const blob = await fetchExport(`/api/export/${incidentId}/pdf`, "Export PDF échoué");
  triggerBlobDownload(blob, `main-courante-${incidentName.replace(/\s+/g, "-").slice(0, 30)}.pdf`);
}

export async function exportXlsx(incidentId: string, incidentName: string): Promise<void> {
  const blob = await fetchExport(`/api/export/${incidentId}/xlsx`, "Export Excel échoué");
  triggerBlobDownload(blob, `rapport-${incidentName.replace(/\s+/g, "-").slice(0, 30)}.xlsx`);
}
