import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { businessDate } from "../shared/expiry";
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
export const D = (v: Decimal.Value) => new Decimal(v);
export const money = (v: Decimal.Value) => D(v).toDecimalPlaces(2);
export const today = businessDate;
export type Actor = { id: string; role: string };
export function requireRole(a: Actor, roles: string[]) {
  if (!roles.includes(a.role)) throw new Error("FORBIDDEN");
}
export const managers = ["ADMIN", "MANAGER"];
export async function transaction<T>(
  fn: (t: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(
        async (t) => {
          await t.$executeRaw`SELECT pg_advisory_xact_lock(4815162342::bigint)`;
          return fn(t);
        },
        { isolationLevel: "Serializable", maxWait: 15000, timeout: 30000 },
      );
    } catch (e: any) {
      if (e.code === "P2034" && i < 4) continue;
      throw e;
    }
  }
  throw new Error("Transaction retry exhausted");
}
export async function audit(
  t: Prisma.TransactionClient,
  a: Actor,
  action: string,
  entity: string,
  details: any = {},
) {
  await t.audit.create({
    data: {
      userId: a.id,
      action,
      entity,
      details: JSON.parse(JSON.stringify(details)),
    },
  });
}
export async function once(
  t: Prisma.TransactionClient,
  key: string,
  payload: any,
  fn: () => Promise<any>,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const old = await t.operation.findUnique({ where: { key } });
  if (old) {
    if (old.hash !== hash)
      throw new Error(
        "Idempotency key was already used for a different request",
      );
    return old.result;
  }
  const result = JSON.parse(JSON.stringify(await fn()));
  await t.operation.create({ data: { key, hash, result } });
  return result;
}

export const qty = (v: Decimal.Value) => D(v).toDecimalPlaces(6).toNumber();
