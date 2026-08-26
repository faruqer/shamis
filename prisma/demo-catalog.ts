export type DemoProduct = {
  sku: string;
  name: string;
  unitCost: number;
  itemsPerCarton: number;
  totalCartons: number;
};

export type DemoImportBatch = {
  batchNumber: string;
  daysAgo: number;
  notes: string;
  costs: { name: string; amount: number }[];
  credit?: { amount: number; paidAmount?: number };
  products: DemoProduct[];
};

export const DEMO_BATCH_MARKER = "IMP-CN-2025-001";

export const DEMO_IMPORT_BATCHES: DemoImportBatch[] = [
  {
    batchNumber: "IMP-CN-2025-001",
    daysAgo: 90,
    notes: "Electronics — HDMI, USB, and networking cables from Shenzhen",
    costs: [
      { name: "Shipping", amount: 18500 },
      { name: "Customs", amount: 9200 },
      { name: "Port handling", amount: 3500 },
    ],
    credit: { amount: 45000, paidAmount: 20000 },
    products: [
      { sku: "ELC-HDMI-2M", name: "HDMI Cable 2m", unitCost: 78, itemsPerCarton: 40, totalCartons: 35 },
      { sku: "ELC-HDMI-5M", name: "HDMI Cable 5m", unitCost: 125, itemsPerCarton: 30, totalCartons: 28 },
      { sku: "ELC-USB-C-1M", name: "USB-C Cable 1m", unitCost: 42, itemsPerCarton: 60, totalCartons: 45 },
      { sku: "ELC-USB-C-2M", name: "USB-C Cable 2m", unitCost: 58, itemsPerCarton: 50, totalCartons: 40 },
      { sku: "ELC-ETH-CAT6", name: "Ethernet Cable Cat6 5m", unitCost: 95, itemsPerCarton: 25, totalCartons: 32 },
      { sku: "ELC-AUX-3M", name: "Aux Audio Cable 3m", unitCost: 35, itemsPerCarton: 80, totalCartons: 30 },
      { sku: "ELC-MICRO-USB", name: "Micro USB Cable 1m", unitCost: 28, itemsPerCarton: 100, totalCartons: 25 },
      { sku: "ELC-LIGHTNING", name: "Lightning Cable 1m", unitCost: 65, itemsPerCarton: 50, totalCartons: 30 },
    ],
  },
  {
    batchNumber: "IMP-CN-2025-002",
    daysAgo: 72,
    notes: "Power strips, dividers, and extension cords",
    costs: [
      { name: "Shipping", amount: 14200 },
      { name: "Customs", amount: 6800 },
    ],
    products: [
      { sku: "ELC-EXT-4SKT", name: "Power Extension 4-Socket", unitCost: 220, itemsPerCarton: 12, totalCartons: 50 },
      { sku: "ELC-EXT-6SKT", name: "Power Extension 6-Socket", unitCost: 310, itemsPerCarton: 10, totalCartons: 45 },
      { sku: "ELC-DIV-4WAY", name: "Power Divider 4-Way", unitCost: 145, itemsPerCarton: 20, totalCartons: 40 },
      { sku: "ELC-DIV-6WAY", name: "Power Divider 6-Way", unitCost: 195, itemsPerCarton: 16, totalCartons: 38 },
      { sku: "ELC-ADPT-UK", name: "Universal Travel Adapter", unitCost: 88, itemsPerCarton: 40, totalCartons: 35 },
      { sku: "ELC-SURGE-3", name: "Surge Protector 3-Outlet", unitCost: 175, itemsPerCarton: 15, totalCartons: 42 },
      { sku: "ELC-USB-HUB", name: "USB Hub 4-Port", unitCost: 115, itemsPerCarton: 24, totalCartons: 36 },
    ],
  },
  {
    batchNumber: "IMP-CN-2025-003",
    daysAgo: 55,
    notes: "Building hand tools — hammers, saws, wrenches",
    costs: [
      { name: "Shipping", amount: 22000 },
      { name: "Customs", amount: 11000 },
      { name: "Warehouse unloading", amount: 2800 },
    ],
    credit: { amount: 32000 },
    products: [
      { sku: "BLD-HAM-500", name: "Claw Hammer 500g", unitCost: 185, itemsPerCarton: 24, totalCartons: 55 },
      { sku: "BLD-HAM-800", name: "Claw Hammer 800g", unitCost: 245, itemsPerCarton: 18, totalCartons: 48 },
      { sku: "BLD-SAW-18", name: "Hand Saw 18 inch", unitCost: 320, itemsPerCarton: 12, totalCartons: 40 },
      { sku: "BLD-WRENCH-10", name: "Adjustable Wrench 10 inch", unitCost: 210, itemsPerCarton: 20, totalCartons: 45 },
      { sku: "BLD-PLIER-3PC", name: "Pliers Set 3-Piece", unitCost: 275, itemsPerCarton: 15, totalCartons: 38 },
      { sku: "BLD-TAPE-5M", name: "Measuring Tape 5m", unitCost: 95, itemsPerCarton: 48, totalCartons: 60 },
      { sku: "BLD-SCREWD-6PC", name: "Screwdriver Set 6-Piece", unitCost: 165, itemsPerCarton: 24, totalCartons: 42 },
      { sku: "BLD-LEVEL-60", name: "Spirit Level 60cm", unitCost: 198, itemsPerCarton: 20, totalCartons: 35 },
    ],
  },
  {
    batchNumber: "IMP-CN-2025-004",
    daysAgo: 40,
    notes: "Fasteners — nails, screws, anchors",
    costs: [
      { name: "Shipping", amount: 9800 },
      { name: "Customs", amount: 4200 },
    ],
    products: [
      { sku: "BLD-NAIL-2IN", name: "Steel Nails 2 inch (box)", unitCost: 48, itemsPerCarton: 100, totalCartons: 70 },
      { sku: "BLD-NAIL-3IN", name: "Steel Nails 3 inch (box)", unitCost: 52, itemsPerCarton: 100, totalCartons: 65 },
      { sku: "BLD-NAIL-4IN", name: "Steel Nails 4 inch (box)", unitCost: 58, itemsPerCarton: 80, totalCartons: 55 },
      { sku: "BLD-SCREW-WD", name: "Wood Screws Assorted Box", unitCost: 72, itemsPerCarton: 60, totalCartons: 58 },
      { sku: "BLD-SCREW-MET", name: "Metal Screws Assorted Box", unitCost: 68, itemsPerCarton: 60, totalCartons: 52 },
      { sku: "BLD-ANCHOR-WL", name: "Wall Plug Anchors Box", unitCost: 38, itemsPerCarton: 120, totalCartons: 48 },
      { sku: "BLD-BOLT-MIX", name: "Bolt & Nut Mix Box", unitCost: 85, itemsPerCarton: 40, totalCartons: 44 },
    ],
  },
  {
    batchNumber: "IMP-CN-2025-005",
    daysAgo: 28,
    notes: "Electrical accessories — breakers, bulbs, tape",
    costs: [
      { name: "Shipping", amount: 11500 },
      { name: "Customs", amount: 5400 },
      { name: "Inspection fee", amount: 1200 },
    ],
    products: [
      { sku: "ELC-BRK-32A", name: "Circuit Breaker 32A", unitCost: 420, itemsPerCarton: 10, totalCartons: 30 },
      { sku: "ELC-BRK-63A", name: "Circuit Breaker 63A", unitCost: 580, itemsPerCarton: 8, totalCartons: 25 },
      { sku: "ELC-BULB-12W", name: "LED Bulb 12W E27", unitCost: 62, itemsPerCarton: 50, totalCartons: 55 },
      { sku: "ELC-BULB-15W", name: "LED Bulb 15W E27", unitCost: 78, itemsPerCarton: 40, totalCartons: 50 },
      { sku: "ELC-TAPE-BLK", name: "Electrical Tape Roll", unitCost: 22, itemsPerCarton: 200, totalCartons: 40 },
      { sku: "ELC-STRIPPER", name: "Wire Stripper Tool", unitCost: 135, itemsPerCarton: 30, totalCartons: 35 },
      { sku: "ELC-MULTIM", name: "Digital Multimeter", unitCost: 385, itemsPerCarton: 12, totalCartons: 28 },
      { sku: "ELC-CHGR-20W", name: "Phone Charger 20W", unitCost: 98, itemsPerCarton: 40, totalCartons: 45 },
    ],
  },
  {
    batchNumber: "IMP-CN-2025-006",
    daysAgo: 14,
    notes: "Building consumables — paint, cement tools, safety",
    costs: [{ name: "Shipping", amount: 7600 }],
    products: [
      { sku: "BLD-TROWEL", name: "Cement Trowel", unitCost: 88, itemsPerCarton: 36, totalCartons: 40 },
      { sku: "BLD-ROLLER", name: "Paint Roller Set", unitCost: 115, itemsPerCarton: 24, totalCartons: 38 },
      { sku: "BLD-GLOVES", name: "Safety Gloves Pair", unitCost: 35, itemsPerCarton: 100, totalCartons: 45 },
      { sku: "BLD-GLASSES", name: "Safety Glasses", unitCost: 42, itemsPerCarton: 80, totalCartons: 32 },
      { sku: "BLD-MASK-DST", name: "Dust Mask Box (50)", unitCost: 95, itemsPerCarton: 30, totalCartons: 36 },
      { sku: "ELC-SWITCH-1G", name: "Wall Switch Single Gang", unitCost: 55, itemsPerCarton: 60, totalCartons: 42 },
    ],
  },
];

/** SKUs used for retail preview / low-stock demos */
export const PREVIEW_RETAIL_SKU = "ELC-USB-C-1M";
export const PREVIEW_LOW_STOCK_SKUS = [
  { sku: "ELC-USB-C-1M", remainingCartons: 1, remainingItems: 12 },
  { sku: "ELC-HDMI-2M", remainingCartons: 1, remainingItems: 8 },
  { sku: "BLD-HAM-500", remainingCartons: 0, remainingItems: 6 },
];
export const PREVIEW_WAREHOUSE_LOW_SKU = "ELC-CHGR-20W";
