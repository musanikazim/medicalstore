import { Row } from "./shared";
export const unitsFor = (m: Row) => [
  ...(m.looseAllowed ? [{ value: "base", label: m.baseUnit }] : []),
  { value: "strip", label: `Strip (${m.unitsPerStrip} ${m.baseUnit})` },
  {
    value: "box",
    label: `Box (${m.unitsPerStrip * m.stripsPerBox} ${m.baseUnit})`,
  },
  ...(m.packaging || []).map((p: Row) => ({
    value: p.unitId,
    label: `${p.unit?.name || "Pack"} (${p.factor} ${m.baseUnit})`,
  })),
];
export const unitFactor = (m: Row, u: string) =>
  u === "box"
    ? m.unitsPerStrip * m.stripsPerBox
    : u === "strip"
      ? m.unitsPerStrip
      : u === "base"
        ? 1
        : Number(m.packaging?.find((p: Row) => p.unitId === u)?.factor || 1);
export const unitPrice = (m: Row, u: string) =>
  Number(
    u === "box"
      ? (m.boxPrice ?? Number(m.salePrice) * unitFactor(m, u))
      : u === "strip"
        ? (m.stripPrice ?? Number(m.salePrice) * unitFactor(m, u))
        : u === "base"
          ? m.salePrice
          : (m.packaging?.find((p: Row) => p.unitId === u)?.salePrice ??
            Number(m.salePrice) * unitFactor(m, u)),
  );
