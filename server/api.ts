import { expiryStatus, expiryThreshold } from "../shared/expiry";
import { report } from "./reports";
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import {
  db,
  D,
  money,
  today,
  date,
  saveMedicine,
  savePurchase,
  postPurchase,
  completeSale,
  opening,
  adjust,
  returnStock,
  batchStatus,
  requireRole,
  managers,
  transaction,
  audit,
  Actor,
  medicineSchema,
  importOpening,
} from "./engine";
export const api = Router();
const secret = process.env.JWT_SECRET || "";
if (secret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api",
  maxAge: 8 * 3600000,
};
const safeUser = (u: any) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});
const route = (
  method: "get" | "post" | "put",
  path: string,
  fn: (req: Request, res: Response) => Promise<any>,
) =>
  api[method](path, (req, res, next) => {
    Promise.resolve(fn(req, res))
      .then((value) => {
        if (!res.headersSent && value !== undefined) res.json(value);
      })
      .catch(next);
  });
const actor = (r: Request) => (r as any).actor as Actor;
const safeMedicine = (m: any, a: Actor) => {
  if (a.role === "CASHIER") {
    const { purchasePrice, batches, purchaseLines, ...safe } = m;
    return safe;
  }
  return m;
};
route("get", "/health", async () => {
  await db.$queryRaw`SELECT 1`;
  return { status: "ok" };
});
const attempts = new Map<string, { count: number; until: number }>();
route("post", "/auth/login", async (req, res) => {
  const ip = req.ip || "local";
  const now = Date.now();
  for (const [key, v] of attempts) if (v.until < now) attempts.delete(key);
  const old = attempts.get(ip);
  if (old && old.count >= 10) {
    res.status(429);
    return { error: "Too many attempts. Try again in 15 minutes." };
  }
  attempts.set(ip, {
    count: (old?.count || 0) + 1,
    until: old?.until || now + 900000,
  });
  const { email, password } = z
    .object({ email: z.email(), password: z.string().max(72) })
    .parse(req.body);
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user?.active || !(await bcrypt.compare(password, user.password))) {
    res.status(401);
    return { error: "Invalid email or password" };
  }
  attempts.delete(ip);
  res.cookie(
    "session",
    jwt.sign({ sub: user.id, v: user.sessionVersion }, secret, {
      expiresIn: "8h",
      issuer: "medicalstore",
      audience: "medicalstore",
    }),
    cookieOptions,
  );
  await db.audit.create({
    data: { userId: user.id, action: "LOGIN", entity: user.id, details: {} },
  });
  return safeUser(user);
});
route("get", "/branding", async () => {
  const data = (await db.settings.findUnique({ where: { id: "store" } }))
    ?.data as any;
  return {
    storeName:
      typeof data?.storeName === "string"
        ? data.storeName
        : "Sehat Medical Store",
    logo: typeof data?.logo === "string" ? data.logo : "",
  };
});
api.use(async (req, res, next) => {
  try {
    const payload = jwt.verify(req.cookies?.session || "", secret, {
      issuer: "medicalstore",
      audience: "medicalstore",
    }) as any;
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user?.active || payload.v !== user.sessionVersion) throw new Error();
    (req as any).actor = safeUser(user);
    if (
      req.method !== "GET" &&
      req.get("X-Requested-With") !== "MedicalStore"
    ) {
      res.status(403).json({ error: "Missing request guard" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Sign in to continue" });
  }
});
route("get", "/auth/me", async (r) => actor(r));
route("post", "/auth/logout", async (r, res) => {
  await db.user.update({
    where: { id: actor(r).id },
    data: { sessionVersion: { increment: 1 } },
  });
  res.clearCookie("session", { ...cookieOptions, maxAge: undefined });
  return { ok: true };
});
route("get", "/medicines", async (r) => {
  const q = String(r.query.q || "");
  const a = actor(r);
  const list = await db.medicine.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { generic: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
    take: 500,
    include: { batches: true },
  });
  return list.map((m) => {
    const available = m.batches
      .filter((b) => b.status === "SELLABLE" && b.expiry >= today())
      .reduce((s, b) => s + b.quantity, 0);
    const stock = m.batches.reduce((s, b) => s + b.quantity, 0);
    const { batches, ...rest } = m;
    const nextExpiry =
      m.batches
        .filter(
          (b) =>
            b.status === "SELLABLE" && b.expiry >= today() && b.quantity > 0,
        )
        .map((b) => b.expiry)
        .sort()[0] || null;
    return { ...safeMedicine(rest, a), available, stock, nextExpiry };
  });
});
route("post", "/medicines", async (r) => saveMedicine(actor(r), r.body));
route("put", "/medicines/:id", async (r) =>
  saveMedicine(actor(r), r.body, String(r.params.id)),
);
route("post", "/medicines/import", async (r) => {
  requireRole(actor(r), managers);
  const rows = z.array(medicineSchema).min(1).max(500).parse(r.body.rows);
  return transaction(async (t) => {
    const created = [];
    for (const row of rows) {
      const m = await t.medicine.create({
        data: { ...row, barcode: row.barcode || null },
      });
      created.push(m.id);
    }
    await audit(t, actor(r), "MEDICINE_IMPORT", "catalogue", {
      count: created.length,
    });
    return { count: created.length };
  });
});
route("get", "/suppliers", async (r) => {
  requireRole(actor(r), managers);
  return db.supplier.findMany({ orderBy: { name: "asc" } });
});
route("post", "/suppliers", async (r) => {
  requireRole(actor(r), managers);
  const data = z
    .object({
      name: z.string().trim().min(1).max(250),
      phone: z.string().max(100).default(""),
      address: z.string().max(500).default(""),
    })
    .parse(r.body);
  return transaction(async (t) => {
    const s = await t.supplier.create({ data });
    await audit(t, actor(r), "SUPPLIER_CREATE", s.id, data);
    return s;
  });
});
route("put", "/suppliers/:id", async (r) => {
  requireRole(actor(r), managers);
  const data = z
    .object({
      name: z.string().trim().min(1).max(250),
      phone: z.string().max(100).default(""),
      address: z.string().max(500).default(""),
    })
    .parse(r.body);
  return transaction(async (t) => {
    const supplier = await t.supplier.update({
      where: { id: String(r.params.id) },
      data,
    });
    await audit(t, actor(r), "SUPPLIER_UPDATE", supplier.id, data);
    return supplier;
  });
});
route("get", "/purchases", async (r) => {
  requireRole(actor(r), managers);
  return db.purchase.findMany({
    include: { supplier: true, lines: { include: { medicine: true } } },
    orderBy: { createdAt: "desc" },
  });
});
route("post", "/purchases", async (r) => savePurchase(actor(r), r.body));
route("put", "/purchases/:id", async (r) =>
  savePurchase(actor(r), r.body, String(r.params.id)),
);
route("post", "/purchases/:id/post", async (r) =>
  postPurchase(
    actor(r),
    String(r.params.id),
    r.body.key,
    r.body.expiryOverrides || [],
  ),
);
route("get", "/purchases/:id/attachment", async (r, res) => {
  requireRole(actor(r), managers);
  const file = await db.attachment.findUniqueOrThrow({
    where: { purchaseId: String(r.params.id) },
  });
  res.attachment(file.filename).type(file.mime).send(Buffer.from(file.data));
});
route("post", "/purchases/:id/attachment", async (r) => {
  requireRole(actor(r), managers);
  const p = z
    .object({
      filename: z
        .string()
        .min(1)
        .max(150)
        .regex(/^[a-zA-Z0-9._ -]+$/),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      data: z.string().max(1400000),
    })
    .parse(r.body);
  const bytes = Buffer.from(p.data, "base64");
  if (bytes.length > 1048576 || bytes.length < 8)
    throw new Error("Attachment must be 1 MB or smaller");
  if (!(
    (p.mime === "application/pdf" &&
      bytes.subarray(0, 5).toString() === "%PDF-") ||
    (p.mime === "image/png" &&
      bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
    (p.mime === "image/jpeg" &&
      bytes.subarray(0, 3).toString("hex") === "ffd8ff")
  ))
    throw new Error("Attachment content does not match its file type");
  return transaction(async (t) => {
    const purchase = await t.purchase.findUniqueOrThrow({
      where: { id: String(r.params.id) },
    });
    if (purchase.status !== "DRAFT")
      throw new Error("Attachments to posted invoices are immutable");
    const file = await t.attachment.upsert({
      where: { purchaseId: purchase.id },
      create: {
        purchaseId: purchase.id,
        filename: p.filename,
        mime: p.mime,
        data: bytes,
      },
      update: { filename: p.filename, mime: p.mime, data: bytes },
    });
    await audit(t, actor(r), "PURCHASE_ATTACHMENT", purchase.id, {
      filename: p.filename,
    });
    return { id: file.id };
  });
});
route("post", "/sales", async (r) => completeSale(actor(r), r.body));
route("get", "/sales", async (r) => {
  const a = actor(r);
  const sales = await db.sale.findMany({
    where: a.role === "CASHIER" ? { createdBy: a.id } : {},
    include: {
      payments: true,
      lines: {
        include: {
          allocations: {
            include: { batch: { select: { number: true, expiry: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return sales.map((s) => {
    if (a.role !== "CASHIER") return s;
    const { cogs, lines, ...rest } = s;
    return {
      ...rest,
      lines: lines.map(({ cogs, allocations, ...l }) => ({
        ...l,
        allocations: allocations.map(({ cost, ...al }) => al),
      })),
    };
  });
});
route("get", "/inventory", async (r) => {
  requireRole(actor(r), managers);
  return db.batch.findMany({
    include: {
      medicine: true,
      purchaseLine: { include: { purchase: { include: { supplier: true } } } },
    },
    orderBy: [{ expiry: "asc" }, { id: "asc" }],
  });
});
route("get", "/movements", async (r) => {
  requireRole(actor(r), managers);
  return db.movement.findMany({
    where: r.query.medicineId
      ? { batch: { medicineId: String(r.query.medicineId) } }
      : {},
    include: { batch: { include: { medicine: true } } },
    orderBy: { createdAt: "desc" },
  });
});
route("post", "/opening", async (r) => opening(actor(r), r.body));
route("post", "/opening/import", async (r) => importOpening(actor(r), r.body));
route("post", "/adjustments", async (r) => adjust(actor(r), r.body));
route("put", "/batches/:id/status", async (r) =>
  batchStatus(
    actor(r),
    String(r.params.id),
    r.body.status,
    r.body.reason,
    r.body.ignoreExpiryWarning || false,
  ),
);
route("post", "/returns", async (r) => returnStock(actor(r), r.body));
route("get", "/returns", async (r) => {
  requireRole(actor(r), managers);
  return db.returnRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
});
route("get", "/reconciliation", async (r) => {
  requireRole(actor(r), managers);
  const batches = await db.batch.findMany({ include: { movements: true } });
  return batches
    .map((b) => ({
      batchId: b.id,
      quantity: b.quantity,
      ledger: b.movements.reduce((s, m) => s + m.quantity, 0),
    }))
    .filter((b) => b.quantity !== b.ledger);
});
route("get", "/reports", async (r) => {
  requireRole(actor(r), managers);
  return report(
    String(r.query.from || today()),
    String(r.query.to || today()),
    r.query.medicineId ? String(r.query.medicineId) : undefined,
    r.query.supplierId ? String(r.query.supplierId) : undefined,
  );
});
route("get", "/reports/export", async (r, res) => {
  requireRole(actor(r), managers);
  const result = await report(
    String(r.query.from || today()),
    String(r.query.to || today()),
    r.query.medicineId ? String(r.query.medicineId) : undefined,
    r.query.supplierId ? String(r.query.supplierId) : undefined,
  );
  const kind = z
    .enum([
      "sales",
      "purchases",
      "returns",
      "inventory",
      "movements",
      "profit",
      "medicineSales",
      "supplierPurchases",
      "daily",
      "inventorySummary",
      "lowStock",
      "outOfStock",
      "nearExpiry",
      "expired",
      "adjustments",
    ])
    .parse(r.query.kind || "sales");
  let rows: any[];
  if (["inventory", "nearExpiry", "expired"].includes(kind))
    rows = result[kind as "inventory" | "nearExpiry" | "expired"].map((b) => ({
      Medicine: b.medicine.name,
      Batch: b.number,
      Expiry: b.expiry,
      Status: b.status,
      Quantity: b.quantity,
      UnitCost: b.cost.toString(),
      Value: D(b.cost.toString()).mul(b.quantity).toFixed(2),
    }));
  else if (["movements", "adjustments"].includes(kind))
    rows = result[kind as "movements" | "adjustments"].map((m) => ({
      Date: m.effectiveDate || m.createdAt.toISOString(),
      Medicine: m.batch.medicine.name,
      Batch: m.batch.number,
      Type: m.type,
      Quantity: m.quantity,
      Reference: m.reference,
      Reason: m.reason,
    }));
  else if (kind === "profit")
    rows = result.sales
      .map((s) => ({
        Invoice: s.number,
        Revenue: s.total.toString(),
        COGS: s.cogs.toString(),
        GrossProfit: D(s.total.toString()).minus(s.cogs.toString()).toFixed(2),
      }))
      .concat(
        result.returns
          .filter((x) => x.type === "SALE")
          .map((x) => ({
            Invoice: 0,
            Revenue: D(x.amount.toString()).neg().toFixed(2),
            COGS: D(x.cogs.toString()).neg().toFixed(2),
            GrossProfit: D(x.amount.toString())
              .minus(x.cogs.toString())
              .neg()
              .toFixed(2),
          })),
      );
  else if (
    [
      "medicineSales",
      "supplierPurchases",
      "daily",
      "inventorySummary",
      "lowStock",
      "outOfStock",
    ].includes(kind)
  )
    rows = (result[kind as "daily"] as any[]).map(
      ({ medicineId, supplierId, ...row }) => row,
    );
  else
    rows = (result[kind] as any[]).map((x) => ({
      Reference: x.number || x.id,
      Date: x.createdAt.toISOString(),
      Total: (x.total || x.amount).toString(),
      Status: x.status || x.type || "POSTED",
    }));
  const format = z.enum(["csv", "xlsx", "pdf"]).parse(r.query.format || "csv");
  res.attachment(`medicalstore-${kind}.${format}`);
  if (format === "pdf") {
    res.type("pdf");
    const pdf = new PDFDocument({ margin: 35 });
    pdf.pipe(res);
    pdf.fontSize(18).text("MedicalStore • " + kind);
    pdf.fontSize(10).text(result.from + " to " + result.to + " • PKR");
    for (const row of rows)
      pdf.moveDown().text(
        Object.entries(row)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | "),
      );
    pdf.end();
    return;
  }
  const safe = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "string" && /^[=+@\-\t\r]/.test(v) ? "'" + v : v,
      ]),
    ),
  );
  if (format === "csv") {
    const keys = Object.keys(safe[0] || {});
    const escape = (v: any) =>
      '"' + String(v ?? "").replaceAll('"', '""') + '"';
    res
      .type("text/csv")
      .send(
        [
          keys.map(escape).join(","),
          ...safe.map((row) => keys.map((k) => escape(row[k])).join(",")),
        ].join("\r\n"),
      );
    return;
  }
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Report");
  sheet.columns = Object.keys(safe[0] || {}).map((k) => ({
    header: k,
    key: k,
    width: 22,
  }));
  safe.forEach((row) => sheet.addRow(row));
  res
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(Buffer.from(await book.xlsx.writeBuffer()));
});
route("get", "/sales/:id/receipt", async (r, res) => {
  const sale = await db.sale.findUniqueOrThrow({
    where: { id: String(r.params.id) },
    include: { lines: true, payments: true },
  });
  if (actor(r).role === "CASHIER" && sale.createdBy !== actor(r).id)
    throw new Error("FORBIDDEN");
  const settings =
    ((await db.settings.findUnique({ where: { id: "store" } }))?.data as any) ||
    {};
  res.type("pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="receipt-${sale.number}.pdf"`,
  );
  const width = settings.receiptWidth === "58" ? 164 : 227;
  const pdf = new PDFDocument({
    size: [width, Math.max(400, 250 + sale.lines.length * 50)],
    margin: 12,
  });
  if (settings.logo)
    pdf
      .image(
        Buffer.from(settings.logo.split(",")[1], "base64"),
        (width - 40) / 2,
        12,
        { width: 40, height: 40, fit: [40, 40] },
      )
      .moveDown(4);
  pdf.pipe(res);
  pdf
    .fontSize(14)
    .text(settings.storeName || "MedicalStore", { align: "center" });
  pdf
    .fontSize(8)
    .text(
      [settings.address, settings.phone, settings.licence]
        .filter(Boolean)
        .join("\n"),
      { align: "center" },
    );
  pdf
    .moveDown()
    .text((settings.invoicePrefix || "MS") + "-" + sale.number)
    .text(sale.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" }));
  for (const l of sale.lines)
    pdf
      .moveDown()
      .text(l.name)
      .text(
        `${l.quantity} ${l.unit} × PKR ${money(l.price.toString())} = ${money(l.net.toString())}`,
      );
  pdf
    .moveDown()
    .fontSize(12)
    .text("Total PKR " + money(sale.total.toString()));
  pdf
    .fontSize(8)
    .text("Payment: " + sale.payments[0]?.method)
    .text(
      "Discount PKR " +
        money(
          D(sale.lines.reduce((s, l) => s.plus(l.discount.toString()), D(0))),
        ),
    )
    .moveDown()
    .text(settings.footer || "Thank you. Please retain your receipt.");
  pdf.end();
});
const settingSchema = z.object({
  allowLooseSales: z.boolean().default(true),
  defaultMinimumStock: z.number().int().nonnegative().max(10000000).default(10),
  cashierDiscountPercent: z.number().min(0).max(100).default(0),
  logo: z
    .string()
    .max(300000)
    .refine(
      (v) => !v || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v),
      "Use a PNG or JPEG logo",
    )
    .default(""),
  storeName: z.string().min(1).max(150),
  address: z.string().max(500).default(""),
  phone: z.string().max(50).default(""),
  licence: z.string().max(150).default(""),
  footer: z.string().max(500).default(""),
  receiptWidth: z.enum(["58", "80"]).default("80"),
  expiryDays: z.number().int().nonnegative().safe().default(90),
  invoicePrefix: z.string().max(15).default("MS"),
  defaultPayment: z.enum(["CASH", "CARD", "RAAST", "OTHER"]).default("CASH"),
});
route(
  "get",
  "/settings",
  async () =>
    (await db.settings.findUnique({ where: { id: "store" } }))?.data || {
      storeName: "MedicalStore",
      receiptWidth: "80",
      expiryDays: 90,
      invoicePrefix: "MS",
      defaultPayment: "CASH",
    },
);
route("put", "/settings", async (r) => {
  requireRole(actor(r), ["ADMIN"]);
  return transaction(async (t) => {
    const existing =
      ((await t.settings.findUnique({ where: { id: "store" } }))
        ?.data as any) || {};
    const data = settingSchema.parse({ ...existing, ...r.body });
    if (data.logo) {
      try {
        const check = new PDFDocument();
        check.image(Buffer.from(data.logo.split(",")[1], "base64"), {
          width: 40,
        });
        check.end();
      } catch {
        throw new Error("Logo image is invalid");
      }
    }

    await t.settings.upsert({
      where: { id: "store" },
      create: { id: "store", data },
      update: { data: { ...existing, ...data } },
    });
    await audit(t, actor(r), "SETTINGS", "store", {
      ...data,
      logo: data.logo ? "uploaded" : "",
    });
    return data;
  });
});
route("get", "/users", async (r) => {
  requireRole(actor(r), ["ADMIN"]);
  return (await db.user.findMany()).map((u) => ({
    ...safeUser(u),
    active: u.active,
  }));
});
route("post", "/users", async (r) => {
  requireRole(actor(r), ["ADMIN"]);
  const p = z
    .object({
      name: z.string().min(1).max(100),
      email: z.email(),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (v) => Buffer.byteLength(v) <= 72,
          "Password must be 72 UTF-8 bytes or fewer",
        ),
      role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
    })
    .parse(r.body);
  return transaction(async (t) => {
    const u = await t.user.create({
      data: {
        ...p,
        email: p.email.toLowerCase(),
        password: await bcrypt.hash(p.password, 12),
      },
    });
    await audit(t, actor(r), "USER_CREATE", u.id, { role: u.role });
    return safeUser(u);
  });
});
route("put", "/users/:id", async (r) => {
  requireRole(actor(r), ["ADMIN"]);
  const p = z
    .object({
      active: z.boolean(),
      role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (v) => Buffer.byteLength(v) <= 72,
          "Password must be 72 UTF-8 bytes or fewer",
        )
        .optional(),
    })
    .parse(r.body);
  return transaction(async (t) => {
    const id = String(r.params.id);
    if (id === actor(r).id && (!p.active || p.role !== "ADMIN"))
      throw new Error("Cannot remove your own administrator access");
    const old = await t.user.findUniqueOrThrow({ where: { id } });
    if (
      old.role === "ADMIN" &&
      (!p.active || p.role !== "ADMIN") &&
      (await t.user.count({ where: { active: true, role: "ADMIN" } })) <= 1
    )
      throw new Error("At least one administrator is required");
    const data = {
      ...p,
      password: p.password ? await bcrypt.hash(p.password, 12) : undefined,
      sessionVersion: { increment: 1 },
    };
    const u = await t.user.update({ where: { id }, data });
    await audit(t, actor(r), "USER_UPDATE", id, {
      role: p.role,
      active: p.active,
      passwordChanged: !!p.password,
    });
    return safeUser(u);
  });
});
route("get", "/audit", async (r) => {
  requireRole(actor(r), ["ADMIN"]);
  return db.audit.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
});
api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: err.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; "),
    });
    return;
  }
  if (err.code === "P2002") {
    res.status(409).json({
      error: "Duplicate record: " + (err.meta?.target || "unique field"),
    });
    return;
  }
  if (err.code === "P2025") {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  if (err.code === "P2003") {
    res.status(400).json({ error: "Referenced record does not exist" });
    return;
  }
  const message = err.message || "Request failed";
  if (err.code || message.includes("prisma.")) {
    console.error("Database failure", err.code);
    res.status(500).json({
      error: "Database operation failed; no transaction was committed",
    });
    return;
  }
  res.status(message === "FORBIDDEN" ? 403 : 400).json({ error: message });
});
