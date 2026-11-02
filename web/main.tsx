import React, { useState, useEffect, useRef, FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  LayoutDashboard,
  Pill,
  ShoppingBag,
  ScanLine,
  Package,
  BarChart3,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Menu,
  X,
  Trash2,
  Printer,
  Download,
  Check,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Wallet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { readSheet, exportSheet } from "./spreadsheets";
import { Button } from "./components/ui/button";
import "./style.css";
import {
  api,
  pk,
  day,
  fmt,
  Row,
  Badge,
  Empty,
  Modal,
  Field,
  Table,
  useData,
  ErrorContext,
  useBusinessDate,
} from "./shared";
import Customers from "./screens/Customers";
import Dashboard from "./screens/Dashboard";
import Medicines from "./screens/Medicines";
import Purchases from "./screens/Purchases";
import POS from "./screens/POS";
import Inventory from "./screens/Inventory";
import Reports from "./screens/Reports";
import StoreSettings from "./screens/StoreSettings";
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Medicines", Pill],
  ["Purchases", ShoppingBag],
  ["POS / Sales", ScanLine],
  ["Inventory", Package],
  ["Reports", BarChart3],
  ["Customers", Wallet],
  ["Settings", Settings],
] as const;
function App() {
  const businessDate = useBusinessDate();
  const [user, setUser] = useState<Row | null>(null),
    [ready, setReady] = useState(false),
    [page, setPage] = useState("Dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [medicines, setMedicines] = useState<Row[]>([]),
    [settings, setSettings] = useState<Row>({}),
    [settingsLoaded, setSettingsLoaded] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    api("/branding")
      .then((b) => setSettings((p) => (p.storeName ? p : { ...p, ...b })))
      .catch(() => {});
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    const fn = () => setUser(null);
    window.addEventListener("signed-out", fn);
    return () => window.removeEventListener("signed-out", fn);
  }, []);
  useEffect(() => {
    let current = true;
    if (user)
      Promise.all([api("/medicines"), api("/settings")])
        .then(([m, s]) => {
          if (!current) return;
          setMedicines(m);
          setSettings(s);
          setSettingsLoaded(true);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [user, version, businessDate]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const run = async (
    fn: () => Promise<any>,
    message = "Saved successfully",
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      setVersion((v) => v + 1);
      setNotice(message);
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    document.title =
      (settings.storeName?.trim() || "Sehat Medical Store") + " POS";
  }, [settings.storeName]);
  const ctx = {
    businessDate,
    settingsLoaded,
    onSettingsSaved: setSettings,
    user: user!,
    medicines,
    settings,
    version,
    busy,
    run,
    setError,
    setPage,
  };
  if (!ready) return <div className="loading">Preparing your workspace…</div>;
  if (!user)
    return (
      <Login
        branding={settings}
        onLogin={(u) => {
          setUser(u);
          setPage(u.role === "CASHIER" ? "POS / Sales" : "Dashboard");
        }}
      />
    );
  const allowed =
    user.role === "CASHIER"
      ? ["Medicines", "POS / Sales", "Customers"]
      : nav.map((n) => n[0]);
  return (
    <ErrorContext.Provider value={error}>
      <div className={"app " + (collapsed ? "collapsed" : "")}>
        <aside>
          <div
            className="brand store-brand"
            title={settings.storeName || "Sehat Medical Store"}
          >
            {settings.logo ? (
              <img
                className="store-logo"
                src={settings.logo}
                alt={(settings.storeName || "Store") + " logo"}
              />
            ) : (
              <span className="brand-icon" aria-label="Default pharmacy icon">
                <Activity />
              </span>
            )}
            {!collapsed && (
              <div className="store-brand-name">
                {settings.storeName || "Sehat Medical Store"}
              </div>
            )}
          </div>
          <p className="nav-label">WORKSPACE</p>
          <nav>
            {nav
              .filter(([n]) => allowed.includes(n))
              .map(([n, Icon]) => (
                <button
                  key={n}
                  className={page === n ? "active" : ""}
                  title={n}
                  onClick={() => {
                    setPage(n);
                    setSearch("");
                  }}
                >
                  <Icon size={20} />
                  {!collapsed && <span>{n}</span>}
                  {page === n && !collapsed && <ChevronRight size={15} />}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="secure">
              <ShieldCheck size={20} />
              {!collapsed && (
                <div>
                  Every unit accounted for<small>Batch-tracked inventory</small>
                </div>
              )}
            </div>
            <button onClick={() => setCollapsed(!collapsed)}>
              <Menu size={18} />
              {!collapsed && "Collapse sidebar"}
            </button>
          </div>
        </aside>
        <div className="main">
          <header>
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <b>{page}</b>
            </div>
            <div className="global-search">
              <Search size={17} />
              <input
                aria-label="Global medicine search"
                placeholder="Search medicines or scan barcode…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage("Medicines");
                }}
              />
              <kbd>⌕</kbd>
            </div>
            <div className="user">
              <div className="avatar">{user.name.slice(0, 1)}</div>
              <span>
                {user.name}
                <small>{user.role.toLowerCase()}</small>
              </span>
              <button
                aria-label="Sign out"
                onClick={() =>
                  api("/auth/logout", {})
                    .then(() => setUser(null))
                    .catch((e) => setError(e.message))
                }
              >
                <LogOut size={17} />
              </button>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR PHARMACY, IN FOCUS</div>
                <h1>{page === "POS / Sales" ? "Point of sale" : page}</h1>
                <p>
                  {
                    (
                      {
                        Dashboard:
                          "A clear view of your store. Every sale, every batch, every day.",
                        Medicines:
                          "Your medicine catalogue, organized and always within reach.",
                        Purchases:
                          "From supplier invoice to shelf. Keep every purchase traceable.",
                        Inventory:
                          "Know what’s on your shelves, down to the last tablet.",
                        Reports:
                          "Turn your store’s activity into informed decisions.",
                        Settings: "Make this workspace work for your store.",
                        "POS / Sales":
                          "Fast billing. Accurate stock. A smoother day at the counter.",
                      } as Row
                    )[page]
                  }
                </p>
              </div>
              <div className="date-chip">
                <Clock size={16} />
                {fmt(day())}
                <span>PKT</span>
              </div>
            </div>
            {error && (
              <div className="error" role="alert">
                <AlertTriangle size={18} />
                {error}
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={18} />
                {notice}
              </div>
            )}
            {busy && <div className="busy-line" />}
            {page === "Dashboard" && <Dashboard {...ctx} />}{" "}
            {page === "Medicines" && (
              <Medicines {...ctx} search={search} setSearch={setSearch} />
            )}{" "}
            {page === "Purchases" && <Purchases {...ctx} />}{" "}
            {page === "POS / Sales" && <POS {...ctx} />}{" "}
            {page === "Inventory" && <Inventory {...ctx} />}{" "}
            {page === "Reports" && <Reports {...ctx} />}{" "}
            {page === "Customers" && <Customers {...ctx} />}
            {page === "Settings" && <StoreSettings {...ctx} />}
            <footer>
              <span>
                <span className="dot" /> Connected to your store
              </span>
              <span>
                PKR · Asia/Karachi · All quantities in base units unless shown
              </span>
            </footer>
          </main>
        </div>
      </div>
    </ErrorContext.Provider>
  );
}
function Login({
  onLogin,
  branding,
}: {
  onLogin: (u: Row) => void;
  branding: Row;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <section>
        <div className="brand store-brand">
          <span className="brand-icon">
            {branding.logo ? (
              <img
                className="store-logo"
                src={branding.logo}
                alt="Store logo"
              />
            ) : (
              <Activity />
            )}
          </span>
          <div className="store-brand-name">
            {branding.storeName || "Sehat Medical Store"}
          </div>
        </div>
        <h1>
          A healthier way
          <br />
          to run your store.
        </h1>
        <p>
          Simple billing. Precise inventory.
          <br />
          More time for the people at your counter.
        </p>
        <div className="login-feature">
          <ShieldCheck /> Secure access · Traceable stock · Clear reports
        </div>
      </section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onLogin(await api("/auth/login", { email, password }));
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="eyebrow">WELCOME BACK</div>
        <h2>Sign in to your store</h2>
        <p>Enter your account details to continue.</p>
        {error && <div className="error">{error}</div>}
        <Field
          label="Email address"
          type="email"
          value={email}
          set={setEmail}
          required
          autoComplete="username"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          set={setPassword}
          required
          autoComplete="current-password"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <ArrowUpRight size={18} />
        </Button>
        <small>Ask your store administrator if you need an account.</small>
      </form>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
