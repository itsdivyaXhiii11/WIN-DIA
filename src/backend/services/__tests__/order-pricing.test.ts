import {
  calculateBundlePricing,
  calculateOrderBundlePricing,
} from '../../constants/bundle-pricing.constants';
import { parseComboSelections } from '../../constants/combo-flavors.constants';

describe('calculateOrderBundlePricing (tiered across the whole order)', () => {
  it('prices a single line like the line pricing', () => {
    expect(calculateOrderBundlePricing([1]).subtotal).toBe(384);
    expect(calculateOrderBundlePricing([2]).subtotal).toBe(640);
    expect(calculateOrderBundlePricing([4]).subtotal).toBe(1152);
  });

  it('charges the same for 2 bundles of one flavour as 1 bundle each of two flavours', () => {
    const oneLine = calculateOrderBundlePricing([2]);
    const twoLines = calculateOrderBundlePricing([1, 1]);
    expect(twoLines.subtotal).toBe(oneLine.subtotal);
    expect(twoLines.subtotal).toBe(640); // matches the cart/checkout display, not 2 × 384
  });

  it('matches the cart formula 384 + (N - 1) × 256 for any split of N bundles', () => {
    const splits = [[5], [2, 3], [1, 1, 1, 1, 1], [4, 1]];
    for (const split of splits) {
      expect(calculateOrderBundlePricing(split).subtotal).toBe(384 + (5 - 1) * 256);
    }
  });

  it('stores the average per-bundle price and packets shipped', () => {
    const r = calculateOrderBundlePricing([1, 2]);
    expect(r.totalBundles).toBe(3);
    expect(r.subtotal).toBe(896);
    expect(r.unitPrice).toBe(Math.round(896 / 3));
    expect(r.packetsShipped).toBe(18);
  });

  it('returns zeros for an empty order', () => {
    expect(calculateOrderBundlePricing([])).toEqual({
      totalBundles: 0,
      subtotal: 0,
      unitPrice: 0,
      packetsShipped: 0,
    });
  });

  it('keeps calculateBundlePricing unchanged', () => {
    expect(calculateBundlePricing(3).lineTotal).toBe(896);
  });
});

describe('parseComboSelections', () => {
  it('accepts exactly 6 packets and builds a readable summary', () => {
    const r = parseComboSelections({ garlic: 2, jeera: 1, onion: 1, 'curry-leaves': 2 });
    expect(r).toEqual({ ok: true, summary: 'Garlic ×2, Jeera ×1, Onion ×1, Curry Leaves ×2' });
  });

  it('treats both curry-leaf spellings as Curry Leaves', () => {
    const r = parseComboSelections({ 'curry-leaf': 3, garlic: 3 });
    expect(r.ok && r.summary).toBe('Curry Leaves ×3, Garlic ×3');
  });

  it('ignores zero counts', () => {
    const r = parseComboSelections({ garlic: 6, jeera: 0 });
    expect(r).toEqual({ ok: true, summary: 'Garlic ×6' });
  });

  it('rejects totals other than 6', () => {
    expect(parseComboSelections({ garlic: 2, jeera: 2 }).ok).toBe(false);
    expect(parseComboSelections({ garlic: 4, jeera: 4 }).ok).toBe(false);
  });

  it('rejects negative, fractional or malformed selections', () => {
    expect(parseComboSelections({ garlic: -1, jeera: 7 }).ok).toBe(false);
    expect(parseComboSelections({ garlic: 1.5, jeera: 4.5 }).ok).toBe(false);
    expect(parseComboSelections(null).ok).toBe(false);
    expect(parseComboSelections([1, 2, 3]).ok).toBe(false);
    expect(parseComboSelections({ 'bad id!': 6 }).ok).toBe(false);
  });
});
