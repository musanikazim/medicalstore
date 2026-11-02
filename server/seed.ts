import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, saveMedicine, opening, transaction, audit } from "./engine";
import { randomUUID } from "node:crypto";
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL,
    password = process.env.SEED_ADMIN_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters)",
    );
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 12),
      name: "Store Owner",
      role: "ADMIN",
    },
  });
  const a = { id: user.id, role: user.role };
  await db.settings.upsert({
    where: { id: "store" },
    update: {},
    create: {
      id: "store",
      data: {
        storeName: "Sehat Medical Store",
        address: "Main Market, Lahore, Pakistan",
        phone: "042 0000 0000",
        licence: "Enter your drug sale licence",
        footer: "Thank you. Keep medicines out of reach of children.",
        receiptWidth: "80",
        expiryDays: 90,
        invoicePrefix: "MS",
        defaultPayment: "CASH",
      },
    },
  });
  if (process.argv.includes("--demo")) {
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
  console.log(
    "Account prepared. Demo prices are illustrative, not regulated prices.",
  );
}
main().finally(() => db.$disconnect());
