import { db, saveMedicine, opening } from "./engine";
import { randomUUID } from "node:crypto";
import type { Actor } from "./core";
export async function seedDemo(a: Actor) {
  await db.supplier.upsert({
    where: { name: "Lahore Medical Distributors" },
    update: {},
    create: { name: "Lahore Medical Distributors", phone: "0300 0000000" },
  });
  for (const [name, generic, strength, manufacturer, price, cost] of [
    ["Panadol", "Paracetamol", "500mg", "GSK", "3.5", "2.2"],
    ["Brufen", "Ibuprofen", "400mg", "Abbott", "8", "5"],
    ["Disprin", "Aspirin", "300mg", "Reckitt", "2.5", "1.6"],
    [
      "ORS",
      "Oral rehydration salts",
      "1 sachet",
      "Local manufacturer",
      "35",
      "22",
    ],
  ]) {
    const old = await db.medicine.findFirst({
      where: { name, strength, manufacturer },
    });
    if (old) continue;
    const m = await saveMedicine(a, {
      name,
      generic,
      strength,
      manufacturer,
      salePrice: price,
      purchasePrice: cost,
      unitsPerStrip: 10,
      stripsPerBox: 10,
      category: "General",
      barcode: "DEMO-" + name,
    });
    await opening(a, {
      key: randomUUID(),
      medicineId: m.id,
      batchNumber: "DEMO-2026",
      expiry: "2028-12-31",
      quantity: 500,
      unit: "base",
      unitCost: cost,
      reference: "Explicit demonstration seed",
    });
  }
}
