import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowRight, BarChart3, Boxes, CircleDollarSign, Cross, LayoutDashboard, LogOut, Package, Receipt, RotateCcw, Settings, ShoppingCart, Truck, Users } from "lucide-react";
import { balance, cents, dataKey, id, lookup, money, returned, seed, sessionKey, stock, today, total } from "./data.js";
import "./style.css";

const pages = [
  ["Dashboard", LayoutDashboard], ["Products", Package], ["Suppliers", Truck], ["Purchases", Receipt],
  ["Inventory", Boxes], ["POS / Sales", ShoppingCart], ["Returns", RotateCcw],
  ["Credit & collections", CircleDollarSign], ["Reports", BarChart3], ["Settings", Settings], ["Users & roles", Users],
];
const title = "Sehat Medical Store";
const demoEmail = "demo@ivg.com";
const demoCode = "123456"; // Public walkthrough code, displayed on the sign-in screen.
const displayName = (rows, key, fallback = "Walk-in") => lookup(rows, key)?.name ?? fallback;

function Brand() {
  return <div className="brand"><span><Cross size={22} /></span><div>{title}<small>Interactive demo</small></div></div>;
}

function Login({ signIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    if (email.trim().toLowerCase() !== demoEmail || password !== demoCode) {
      setError("Use the demo email and password shown below.");
      return;
    }
    signIn();
  }
  return <div className="login">
    <div className="login-cover"><Brand /><div className="cover-title"><Activity size={44}/><h1>Your pharmacy.<br/>Ready for a walkthrough.</h1><p>Explore stock, billing, and customer credit with fictional records.</p></div></div>
    <div className="login-content"><form onSubmit={submit} className="login-form">
      <h2>Sign in to the demo</h2><p>Try a typical day at Sehat Medical Store.</p>
      <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary">Sign in <ArrowRight size={16}/></button>
      <div className="credentials"><strong>Demo credentials</strong><code>{demoEmail} / {demoCode}</code><button type="button" onClick={() => { setEmail(demoEmail); setPassword(demoCode); setError(""); }}>Fill demo credentials</button></div>
      <small>This login is a simulation. Demo data stays in this browser.</small>
    </form></div>
  </div>;
}

function Panel({ title, action, children }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}
function Table({ headers, rows }) {
  return rows.length ? <div className="table-scroll"><table><thead><tr>{headers.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(([key, ...cells]) => <tr key={key}>{cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>
    : <p className="empty">No records to display.</p>;
}
function Field({ name, label, value, options, type = "text", min, max, step, optional = false }) {
  return <label>{label}{options
    ? <select name={name} required={!optional} defaultValue={value ?? ""}><option value="">{optional ? "None" : "Select…"}</option>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select>
    : <input name={name} type={type} defaultValue={value ?? ""} required={!optional} min={min} max={max} step={step} maxLength={type === "number" ? undefined : 100}/>}</label>;
}
const options = rows => rows.map(row => [row.id, row.name]);
const choices = (...values) => values.map(x => [x, x]);
function Modal({ dialog, close, save }) {
  const [error, setError] = useState("");
  return <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"
    onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <h2 id="dialog-title">{dialog.title}</h2>
    <form onSubmit={event => {
      event.preventDefault();
      const values = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, value.trim()]));
      try { save(dialog, values); } catch (e) { setError(e.message); }
    }}>
      {dialog.fields}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button autoFocus type="button" onClick={close}>Cancel</button><button className="primary">{dialog.button ?? "Save"}</button></div>
    </form>
  </section></div>;
}

function App() {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dataKey)) ?? seed(); } catch { return seed(); }
  });
  const [active, setActive] = useState(() => localStorage.getItem(sessionKey) === "active");
  const [page, setPage] = useState("Dashboard");
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const [cart, setCart] = useState([]);
  const [cartError, setCartError] = useState("");

  function session(value) {
    if (value) localStorage.setItem(sessionKey, "active");
    else localStorage.removeItem(sessionKey);
    setActive(value);
  }
  function go(name) { setPage(name); setQuery(""); setStatus(""); setCartError(""); }
  function change(apply, message) {
    const next = structuredClone(data);
    apply(next);
    localStorage.setItem(dataKey, JSON.stringify(next));
    setData(next);
    setStatus(message);
  }
  function form(title, fields, apply, button, message = "Saved to this browser.") {
    setDialog({ title, fields, apply, button, message });
  }
  function editor(kind, label, row) {
    const product = kind === "products";
    const fields = <><Field name="name" label="Name" value={row?.name}/>
      {product ? <><Field name="sku" label="SKU" value={row?.sku}/><Field name="category" label="Category" value={row?.category}/>
        <Field name="price" label="Retail price (PKR)" value={row && row.price / 100} type="number" min="0.01" max="10000000" step="0.01"/>
        <Field name="cost" label="Unit cost (PKR)" value={row && row.cost / 100} type="number" min="0" max="10000000" step="0.01"/>
        <Field name="threshold" label="Low stock threshold" value={row?.threshold ?? 10} type="number" min="0" max="100000"/>
        {!row && <Field name="stock" label="Opening stock" value={0} type="number" min="0" max="100000"/>}</>
        : kind !== "customers" && <Field name="email" label="Email" value={row?.email} type="email"/>}
      {kind === "users" && <Field name="role" label="Role" value={row?.role} options={choices("Administrator", "Cashier", "Stock clerk")}/>}
    </>;
    form((row ? "Edit " : "Add ") + label, fields, (state, values) => {
      if (!values.name || (product && (!values.sku || !values.category))) throw new Error("Complete all required fields.");
      const unique = product ? "sku" : kind === "customers" ? "name" : "email";
      if (state[kind].some(item => item.id !== row?.id && item[unique].toLowerCase() === values[unique].toLowerCase())) {
        throw new Error("A record with that " + unique + " already exists.");
      }
      if (product) {
        Object.assign(values, { price: cents(values.price), cost: cents(values.cost), threshold: Number(values.threshold) });
        if (!row) values.stock = Number(values.stock);
      }
      if (row) Object.assign(lookup(state[kind], row.id), values);
      else {
        const record = { id: id(), ...values };
        state[kind].unshift(record);
        if (product && record.stock) state.movements.unshift({ id: id(), date: today(), name: record.name, qty: record.stock, reason: "Opening stock" });
      }
    });
  }
  function purchase() {
    form("Record purchase", <><Field name="supplier" label="Supplier" options={options(data.suppliers)}/>
      <Field name="product" label="Product" options={options(data.products)}/><Field name="qty" label="Quantity received" type="number" min="1" max="100000"/>
      <Field name="cost" label="Unit cost (PKR)" type="number" min="0.01" max="10000000" step="0.01"/></>, (state, v) => {
      const qty = Number(v.qty), cost = cents(v.cost), product = lookup(state.products, v.product);
      stock(state, v.product, qty, "Purchase", Math.round((product.cost * product.stock + cost * qty) / (product.stock + qty)));
      state.purchases.unshift({ id: id(), ref: "PO-" + String(state.purchases.length + 1).padStart(3, "0"), date: today(), supplier: v.supplier, product: v.product, name: product.name, qty, amount: cost * qty });
    }, "Record purchase", "Purchase recorded and stock updated.");
  }
  function adjust() {
    form("Adjust stock", <><Field name="product" label="Product" options={options(data.products)}/>
      <Field name="qty" label="Change in units (positive or negative)" type="number" min="-100000" max="100000"/>
      <Field name="note" label="Reason"/></>, (state, v) => {
      if (!v.note) throw new Error("Enter an adjustment reason.");
      stock(state, v.product, Number(v.qty), v.note);
    });
  }
  function addCart(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const product = lookup(data.products, fields.get("product"));
    const qty = Number(fields.get("qty"));
    const old = cart.find(row => row.product === product?.id);
    if (!product || qty + (old?.qty ?? 0) > product.stock) {
      setCartError("There is insufficient stock for this quantity.");
      return;
    }
    setCartError("");
    setCart(old ? cart.map(row => row === old ? { ...row, qty: row.qty + qty } : row) : [...cart, { product: product.id, name: product.name, qty, price: product.price }]);
    event.currentTarget.reset();
  }
  function checkout() {
    form("Complete sale", <><Field name="method" label="Payment method" value="Cash" options={choices("Cash", "Credit")}/>
      <Field name="customer" label="Customer" options={options(data.customers)} optional/></>, (state, v) => {
      if (v.method === "Credit" && !v.customer) throw new Error("Select a customer for a credit sale.");
      if (!cart.length) throw new Error("Add an item before completing the sale.");
      for (const row of cart) stock(state, row.product, -row.qty, "Sale");
      state.sales.unshift({ id: id(), ref: "INV-" + String(state.sales.length + 1).padStart(3, "0"), date: today(), method: v.method, customer: v.customer, amount: cart.reduce((acc, row) => acc + row.price * row.qty, 0), items: cart });
    }, "Record sale", "Sale recorded and stock updated.");
  }
  function returnItem(sale, item) {
    const max = item.qty - returned(data, sale.id, item.product);
    form("Return " + item.name, <Field name="qty" label="Quantity returned" type="number" min="1" max={max}/>, (state, v) => {
      const qty = Number(v.qty);
      if (qty > max) throw new Error("Quantity exceeds the remaining invoice units.");
      stock(state, item.product, qty, "Return");
      state.returns.unshift({ id: id(), date: today(), sale: sale.id, product: item.product, name: item.name, qty, amount: qty * item.price, customer: sale.customer, method: sale.method });
    }, "Record return", "Return recorded and stock restored.");
  }
  function collect(customer) {
    form("Record collection", <><p>{customer.name} owes {money(balance(data, customer.id))}.</p>
      <Field name="amount" label="Amount received (PKR)" type="number" min="0.01" max={balance(data, customer.id) / 100} step="0.01"/></>, (state, v) => {
      const amount = cents(v.amount);
      if (amount > balance(state, customer.id)) throw new Error("Amount exceeds the outstanding balance.");
      state.collections.unshift({ id: id(), date: today(), customer: customer.id, amount });
    });
  }

  if (!active) return <Login signIn={() => session(true)}/>;
  const btn = (text, action) => <button className="primary" onClick={action}>{text}</button>;
  const edit = (kind, label, item) => <button onClick={() => editor(kind, label, item)}>Edit</button>;
  const low = data.products.filter(p => p.stock <= p.threshold);
  const openCredit = data.customers.reduce((sum, c) => sum + Math.max(0, balance(data, c.id)), 0);
  const saleRows = data.sales.map(s => [s.id, s.ref, s.date, displayName(data.customers, s.customer), s.method, money(s.amount)]);
  const filtered = rows => rows.filter(r => Object.values(r).some(value => String(value).toLowerCase().includes(query.toLowerCase())));
  let content;
  switch (page) {
    case "Dashboard":
      content = <><div className="metrics">
        <Metric label="Net sales" value={money(total(data.sales) - total(data.returns))} icon={ShoppingCart}/>
        <Metric label="Stock units" value={data.products.reduce((sum, row) => sum + row.stock, 0)} icon={Boxes}/>
        <Metric label="Low stock items" value={low.length} icon={Activity}/>
        <Metric label="Open customer credit" value={money(openCredit)} icon={CircleDollarSign}/>
      </div><div className="dashboard-grid"><Panel title="Low stock" action={<button onClick={() => go("Inventory")}>View inventory</button>}><Table headers={["Product", "Available", "Threshold"]} rows={low.map(p => [p.id, p.name, <span className="pill warning">{p.stock}</span>, p.threshold])}/></Panel>
        <Panel title="Recent sales" action={<button onClick={() => go("POS / Sales")}>Open POS</button>}><Table headers={["Invoice","Payment","Amount"]} rows={data.sales.slice(0, 5).map(s => [s.id,s.ref,s.method,money(s.amount)])}/></Panel></div></>;
      break;
    case "Products":
      content = <Panel title="Product catalogue" action={btn("Add product", () => editor("products", "product"))}><div className="filters"><label>Search catalogue<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, SKU, or category"/></label></div>
        <Table headers={["Product","SKU","Category","Retail price","Available","Action"]} rows={filtered(data.products).map(p => [p.id,p.name,p.sku,p.category,money(p.price),p.stock,edit("products","product",p)])}/></Panel>;
      break;
    case "Suppliers":
    case "Users & roles": {
      const users = page === "Users & roles", kind = users ? "users" : "suppliers", label = users ? "user" : "supplier";
      content = <Panel title={page} action={btn("Add " + label, () => editor(kind, label))}>
        {users && <p className="note">Roles illustrate store responsibilities. They do not grant access or create login credentials.</p>}
        <Table headers={["Name","Email",...(users ? ["Role"] : []),"Action"]} rows={data[kind].map(row => [row.id,row.name,row.email,...(users ? [row.role] : []),edit(kind,label,row)])}/></Panel>;
      break;
    }
    case "Purchases":
      content = <Panel title="Purchase history" action={btn("Record purchase", purchase)}><Table headers={["Reference","Date","Supplier","Product","Units","Total"]} rows={data.purchases.map(p => [p.id,p.ref,p.date,displayName(data.suppliers,p.supplier),p.name,p.qty,money(p.amount)])}/></Panel>;
      break;
    case "Inventory":
      content = <><Panel title="Stock on hand" action={btn("Adjust stock", adjust)}><Table headers={["Product","Units","Unit cost","Stock value","Status"]} rows={data.products.map(p => [p.id,p.name,p.stock,money(p.cost),money(p.cost*p.stock),<span className={"pill" + (p.stock <= p.threshold ? " warning" : "")}>{p.stock <= p.threshold ? "Reorder" : "In stock"}</span>])}/></Panel>
        <Panel title="Stock movements"><Table headers={["Date","Product","Change","Reason"]} rows={data.movements.map(m => [m.id,m.date,m.name,(m.qty > 0 ? "+" : "") + m.qty,m.reason])}/></Panel></>;
      break;
    case "POS / Sales":
      content = <><Panel title="New sale" action={<button className="primary" disabled={!cart.length} onClick={checkout}>Complete sale</button>}>
        <form className="inline-form" onSubmit={addCart}><Field name="product" label="Product" options={data.products.map(p => [p.id, p.name + " · " + money(p.price) + " · " + p.stock + " available"])}/>
          <Field name="qty" label="Quantity" type="number" value={1} min="1" max="100000"/><button className="primary">Add to cart</button></form>
        {cartError && <p className="error note" role="alert">{cartError}</p>}
        <Table headers={["Item","Units","Total","Action"]} rows={cart.map(row => [row.product,row.name,row.qty,money(row.price*row.qty),<button onClick={() => setCart(cart.filter(x => x !== row))}>Remove</button>])}/>
      </Panel><Panel title="Sales history"><Table headers={["Invoice","Date","Customer","Payment","Amount"]} rows={saleRows}/></Panel></>;
      break;
    case "Returns":
      content = <><Panel title="Return from a sale"><Table headers={["Invoice","Item","Returnable units","Action"]} rows={data.sales.flatMap(s => s.items.map(i => [s,i])).filter(([s,i]) => i.qty > returned(data,s.id,i.product)).map(([s,i]) => [s.id+i.product,s.ref,i.name,i.qty-returned(data,s.id,i.product),<button onClick={() => returnItem(s,i)}>Record return</button>])}/></Panel>
        <Panel title="Return history"><Table headers={["Invoice","Date","Product","Units","Value"]} rows={data.returns.map(r => [r.id,lookup(data.sales,r.sale)?.ref,r.date,r.name,r.qty,money(r.amount)])}/></Panel></>;
      break;
    case "Credit & collections":
      content = <><Panel title="Customer balances" action={btn("Add customer", () => editor("customers","customer"))}><Table headers={["Customer","Balance","Action"]} rows={data.customers.map(c => [c.id,c.name,money(balance(data,c.id)),<div className="row-actions">{edit("customers","customer",c)}<button disabled={balance(data,c.id) <= 0} onClick={() => collect(c)}>Collect payment</button></div>])}/></Panel>
        <Panel title="Collections"><Table headers={["Date","Customer","Received"]} rows={data.collections.map(c => [c.id,c.date,displayName(data.customers,c.customer),money(c.amount)])}/></Panel></>;
      break;
    case "Reports": {
      const rows = list => list.filter(r => period === "all" || r.date === today());
      const values = [["Sales",total(rows(data.sales))],["Returns",total(rows(data.returns))],["Net sales",total(rows(data.sales))-total(rows(data.returns))],["Purchases",total(rows(data.purchases))],["Collections",total(rows(data.collections))]];
      content = <Panel title="Operating summary" action={<label>Period<select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">All time</option><option value="today">Today</option></select></label>}>
        <p className="note">Figures update as demo transactions are recorded.</p><Table headers={["Metric","Amount"]} rows={values.map(([name,v]) => [name,name,money(v)])}/></Panel>;
      break;
    }
    case "Settings":
      content = <><Panel title="Store preferences" action={btn("Edit preferences", () => form("Edit preferences", <>
        <Field name="location" label="Outlet label" value={data.settings.location}/><Field name="reorderNotes" label="Reorder notes" value={data.settings.reorderNotes} optional/>
        </>, (state, v) => { if (!v.location) throw new Error("Enter an outlet label."); state.settings = v; }))}>
        <p className="note"><strong>{data.settings.location}</strong><br/>{data.settings.reorderNotes}</p>
      </Panel><Panel title="Reset demo data" action={<button className="danger" onClick={() => form("Reset demo data", <p>This clears your changes and restores the original sample records in this browser.</p>, state => Object.assign(state, seed()), "Reset demo data", "Sample data restored.")}>Reset demo data</button>}>
        <p className="note">The demo stores its records only in this browser. Changes aren’t shared with other visitors.</p></Panel></>;
      break;
  }
  return <div className="workspace">
    <aside><Brand/><nav aria-label="Main modules">{pages.map(([name, Icon]) => <button key={name} aria-current={page === name ? "page" : undefined} onClick={() => go(name)}><Icon size={18}/>{name}</button>)}</nav>
      <button className="signout" onClick={() => { session(false); go("Dashboard"); setCart([]); }}><LogOut size={17}/>Sign out</button></aside>
    <main><header><div><div className="eyebrow">{data.settings.location}</div><h1>{page}</h1></div><span className="pill">Browser-local demo</span></header>
      <div className="workspace-body">{status && <p className="notice" role="status">{status}</p>}{content}</div>
    </main>
    {dialog && <Modal dialog={dialog} close={() => setDialog(null)} save={(d,v) => {
      change(state => d.apply(state,v),d.message);
      if (d.title === "Complete sale" || d.title === "Reset demo data") { setCart([]); setCartError(""); }
      setDialog(null);
    }}/>}
  </div>;
}
function Metric({ label, value, icon: Icon }) {
  return <div className="metric"><span><Icon size={19}/></span><small>{label}</small><strong>{value}</strong></div>;
}

createRoot(document.getElementById("root")).render(<App/>);
