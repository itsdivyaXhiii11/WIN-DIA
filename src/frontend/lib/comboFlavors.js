// Display names for the flavour ids used by the combo selector.
// The two product pages use different ids for curry leaves
// ("curry-leaves" vs "curry-leaf"), so both are mapped here.
// Keep in sync with src/backend/constants/combo-flavors.constants.ts.
const FLAVOR_LABELS = {
  "curry-leaves": "Curry Leaves",
  "curry-leaf": "Curry Leaves",
  garlic: "Garlic",
  jeera: "Jeera",
  onion: "Onion",
};

export function flavorLabel(id) {
  if (FLAVOR_LABELS[id]) return FLAVOR_LABELS[id];
  return String(id || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Garlic ×2, Jeera ×1, ..." for a flavourSelections object, or "" if none. */
export function comboSummary(selections) {
  if (!selections) return "";
  return Object.entries(selections)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${flavorLabel(id)} ×${count}`)
    .join(", ");
}
