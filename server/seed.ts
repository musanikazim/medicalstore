import { seedDemo } from "./demo";
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./engine";
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
        storeName: "Your Medical Store",
        onboardingComplete: false,
        address: "",
        phone: "",
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
    await seedDemo(a);
    const existing = (
      await db.settings.findUniqueOrThrow({ where: { id: "store" } })
    ).data as any;
    await db.settings.update({
      where: { id: "store" },
      data: { data: { ...existing, onboardingComplete: true } },
    });
  }
  console.log(
    "Account prepared. Demo prices are illustrative, not regulated prices.",
  );
}
main().finally(() => db.$disconnect());
