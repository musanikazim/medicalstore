export const dataKey = "sehat-browser-demo-v1";
export const sessionKey = dataKey + "-session";
export const money = (amount) => new Intl.NumberFormat("en-PK", {
  style: "currency", currency: "PKR", currencyDisplay: "code",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount / 100);
export const cents = (amount) => Math.round(Number(amount) * 100);
export const id = () => crypto.randomUUID();
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
export const total = (rows) => rows.reduce((sum, row) => sum + row.amount, 0);

export function seed() {
  const date = today();
  return {
    products: [
      { id: "p1", name: "Paracetamol 500 mg", sku: "MED-101", category: "Pain relief", price: 12000, cost: 8000, stock: 84, threshold: 15 },
      { id: "p2", name: "Cetirizine 10 mg", sku: "MED-102", category: "Allergy care", price: 18500, cost: 11900, stock: 42, threshold: 12 },
      { id: "p3", name: "Oral rehydration salts", sku: "MED-103", category: "Hydration", price: 5500, cost: 3300, stock: 9, threshold: 15 },
      { id: "p4", name: "Vitamin C 500 mg", sku: "MED-104", category: "Vitamins", price: 32000, cost: 21800, stock: 32, threshold: 10 },
      { id: "p5", name: "Sterile gauze packs", sku: "MED-105", category: "First aid", price: 9000, cost: 5100, stock: 6, threshold: 10 },
    ],
    suppliers: [
      { id: "v1", name: "Cedar Demo Distributors", email: "cedar@example.invalid" },
      { id: "v2", name: "Meadow Demo Supplies", email: "meadow@example.invalid" },
    ],
    customers: [{ id: "c1", name: "Sample Customer A" }, { id: "c2", name: "Sample Customer B" }],
    sales: [
      { id: "s1", ref: "INV-001", date, customer: "c1", method: "Credit", items: [{ product: "p2", name: "Cetirizine 10 mg", qty: 3, price: 18500 }], amount: 55500 },
      { id: "s2", ref: "INV-002", date, customer: "", method: "Cash", items: [{ product: "p4", name: "Vitamin C 500 mg", qty: 2, price: 32000 }], amount: 64000 },
    ],
    purchases: [{ id: "b1", ref: "PO-001", date, supplier: "v1", product: "p1", name: "Paracetamol 500 mg", qty: 24, amount: 192000 }],
    returns: [],
    collections: [{ id: "x1", date, customer: "c1", amount: 10000 }],
    movements: [{ id: "m1", date, name: "Paracetamol 500 mg", qty: 24, reason: "Purchase" }],
    users: [{ id: "u1", name: "Demo Administrator", email: "demo@ivg.com", role: "Administrator" }, { id: "u2", name: "Demo Cashier", email: "cashier@example.invalid", role: "Cashier" }],
    settings: { location: "Demo outlet", reorderNotes: "Review low stock before placing an order." },
  };
}

export const lookup = (rows, key) => rows.find((row) => row.id === key);
export const returned = (state, saleId, product) => state.returns
  .filter((row) => row.sale === saleId && row.product === product)
  .reduce((sum, row) => sum + row.qty, 0);
export function balance(state, customer) {
  const sales = state.sales.filter((row) => row.customer === customer && row.method === "Credit");
  const credits = state.returns.filter((row) => row.customer === customer && row.method === "Credit");
  return total(sales) - total(credits) - total(state.collections.filter((row) => row.customer === customer));
}

export function stock(state, productId, qty, reason, cost) {
  const product = lookup(state.products, productId);
  if (!product || !Number.isSafeInteger(qty) || !qty || product.stock + qty < 0) {
    throw new Error("Enter a valid stock quantity within the available balance.");
  }
  product.stock += qty;
  if (cost !== undefined) product.cost = cost;
  state.movements.unshift({ id: id(), date: today(), name: product.name, qty, reason });
}
