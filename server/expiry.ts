import type { Prisma } from "@prisma/client";
import { expiryStatus, expiryThreshold, businessDate } from "../shared/expiry";
export async function validateStockExpiry(
  t: Prisma.TransactionClient,
  line: {
    medicineId: string;
    batchNumber: string;
    expiry: string;
    ignoreExpiryWarning?: boolean;
    status?: string;
  },
  source: string,
) {
  const settings = (await t.settings.findUnique({ where: { id: "store" } }))
    ?.data as any;
  const threshold = expiryThreshold(settings),
    asOf = businessDate(),
    result = expiryStatus(line.expiry, threshold, asOf);
  if ((line.status || "SELLABLE") !== "SELLABLE") return null;
  if (result.blocked)
    throw new Error(
      `${source}: batch ${line.batchNumber} expires today, is expired, or has an invalid expiry. Normal sellable stock entry is blocked; use quarantined stock where appropriate.`,
    );
  if (result.requiresAcknowledgement && !line.ignoreExpiryWarning)
    throw new Error(
      `${source}: batch ${line.batchNumber} expires in ${result.days} days (warning threshold ${threshold} days). Check Ignore Expiry Warning to acknowledge this batch.`,
    );
  const medicine = result.requiresAcknowledgement
    ? await t.medicine.findUniqueOrThrow({
        where: { id: line.medicineId },
        select: { name: true },
      })
    : null;
  return result.requiresAcknowledgement
    ? {
        medicineName: medicine!.name,
        medicineId: line.medicineId,
        batchNumber: line.batchNumber,
        expiry: result.expiry,
        remainingDays: result.days,
        warningDays: threshold,
        businessDate: asOf,
        source,
      }
    : null;
}
