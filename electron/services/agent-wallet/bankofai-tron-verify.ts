/**
 * Try to resolve the TRON wallet address linked to a BANK OF AI API key (best-effort).
 * If the platform does not expose an endpoint yet, returns null and the UI skips strict binding checks.
 */

function pickTronAddressFromJson(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const j = value as Record<string, unknown>;
  const keys = ['tron_address', 'tronAddress', 'tron_wallet_address', 'wallet_address', 'address'];
  for (const k of keys) {
    const v = j[k];
    if (typeof v === 'string' && v.startsWith('T') && v.length >= 26) {
      return v;
    }
  }
  const data = j.data;
  if (data && typeof data === 'object') {
    return pickTronAddressFromJson(data);
  }
  const result = j.result;
  if (result && typeof result === 'object') {
    return pickTronAddressFromJson(result);
  }
  return null;
}

function buildCandidateUrls(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/$/, '');
  const roots = trimmed.endsWith('/v1') ? [trimmed, trimmed.replace(/\/v1$/, '')] : [trimmed, `${trimmed}/v1`];
  const paths = [
    '/wallet/tron-address',
    '/user/tron-address',
    '/account/tron-address',
    '/account/wallet',
    '/user/wallet',
  ];
  const out: string[] = [];
  for (const root of roots) {
    for (const p of paths) {
      out.push(`${root}${p}`);
    }
  }
  return [...new Set(out)];
}

export async function fetchBankOfAiLinkedTronAddress(
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const key = apiKey.trim();
  const base = baseUrl.trim();
  if (!key || !base) return null;

  for (const url of buildCandidateUrls(base)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const addr = pickTronAddressFromJson(json);
      if (addr) return addr;
    } catch {
      // try next URL
    }
  }
  return null;
}
