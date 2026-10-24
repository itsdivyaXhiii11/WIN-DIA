/**
 * Combo flavour helpers (server side).
 * The combo selector sends `flavorSelections` as { flavorId: packetCount }.
 * Keep the labels in sync with src/frontend/lib/comboFlavors.js.
 */
import { BundlePricing } from './bundle-pricing.constants';

const FLAVOR_LABELS: Record<string, string> = {
  'curry-leaves': 'Curry Leaves',
  'curry-leaf': 'Curry Leaves',
  garlic: 'Garlic',
  jeera: 'Jeera',
  onion: 'Onion',
};

export function flavorLabel(id: string): string {
  if (FLAVOR_LABELS[id]) return FLAVOR_LABELS[id];
  return String(id || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A plain shape (not a discriminated union): the project's tsconfig isn't
// strict, so TypeScript can't narrow a union on `ok` there.
export interface ComboParseResult {
  ok: boolean;
  summary?: string;
  reason?: string;
}

/**
 * Validates a combo's flavour selection (must total exactly one bundle of
 * packets, with whole, non-negative counts) and returns a readable summary
 * such as "Garlic ×2, Jeera ×1, Onion ×1, Curry Leaves ×2" that is stored in
 * the order item's `flavor` column.
 */
export function parseComboSelections(selections: unknown): ComboParseResult {
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) {
    return { ok: false, reason: 'Invalid combo selection' };
  }

  const parts: string[] = [];
  let total = 0;
  for (const [id, rawCount] of Object.entries(selections as Record<string, unknown>)) {
    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, reason: 'Invalid combo selection' };
    }
    if (count === 0) continue;
    if (!/^[a-z0-9_-]{1,40}$/i.test(id)) {
      return { ok: false, reason: 'Invalid combo flavour' };
    }
    total += count;
    parts.push(`${flavorLabel(id)} ×${count}`);
  }

  if (total !== BundlePricing.PACKETS_PER_BUNDLE) {
    return {
      ok: false,
      reason: `A combo must contain exactly ${BundlePricing.PACKETS_PER_BUNDLE} packets (you selected ${total})`,
    };
  }

  return { ok: true, summary: parts.join(', ') };
}
