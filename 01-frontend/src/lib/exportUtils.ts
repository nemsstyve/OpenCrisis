import { tokenStore } from "./tokenStore";

/**
 * Télécharge le rapport PDF de la main courante d'un incident.
 * Endpoint : GET /api/export/:incidentId/pdf
 */
export async function exportPdf(incidentId: string, incidentName: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`/api/export/${incidentId}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Export PDF échoué (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `main-courante-${incidentName.replace(/\s+/g, "-").slice(0, 30)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Télécharge le rapport Excel complet d'un incident.
 * Endpoint : GET /api/export/:incidentId/xlsx
 */
export async function exportXlsx(incidentId: string, incidentName: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`/api/export/${incidentId}/xlsx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Export Excel échoué (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport-${incidentName.replace(/\s+/g, "-").slice(0, 30)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
