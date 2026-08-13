export type CommodityMapping = {
  itemId: string; itemName: string; state: string; district: string; market: string; commodity: string;
  variety?: string; grade?: string; kgPerStockUnit?: number; verified: boolean;
};

/**
 * Candidate Sangli mappings from the supplied pack. They intentionally remain
 * disabled until exact Agmarknet variety/grade values and real inventory item
 * IDs have been confirmed with scripts/discover-mandi-varieties.mjs.
 */
export const COMMODITY_MAPPINGS: CommodityMapping[] = [
  { itemId: "REPLACE_ME_rice", itemName: "Rice", state: "Maharashtra", district: "Sangli", market: "Sangli", commodity: "Rice", verified: false },
  { itemId: "REPLACE_ME_tur_dal", itemName: "Tur Dal", state: "Maharashtra", district: "Sangli", market: "Sangli", commodity: "Arhar (Tur/Red Gram)(Whole)", verified: false },
  { itemId: "REPLACE_ME_onion", itemName: "Onion", state: "Maharashtra", district: "Sangli", market: "Sangli", commodity: "Onion", verified: false },
  { itemId: "REPLACE_ME_tomato", itemName: "Tomato", state: "Maharashtra", district: "Sangli", market: "Sangli", commodity: "Tomato", verified: false },
  { itemId: "REPLACE_ME_potato", itemName: "Potato", state: "Maharashtra", district: "Sangli", market: "Sangli", commodity: "Potato", verified: false },
];

export function verifiedCommodityMappings() {
  return COMMODITY_MAPPINGS.filter((mapping) => mapping.verified && !mapping.itemId.startsWith("REPLACE_ME_"));
}

export function unverifiedCommodityCount() {
  return COMMODITY_MAPPINGS.length - verifiedCommodityMappings().length;
}
