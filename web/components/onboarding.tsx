import React, { useState } from "react";
import { api, Field } from "../shared";
import { Button } from "./ui/button";
export default function StoreOnboarding(c: any) {
  const [identity, setIdentity] = useState({
    storeName: c.settings.storeName || "",
    address: c.settings.address || "",
    phone: c.settings.phone || "",
  });
  const finish = async (page?: string) => {
    await c.run(async () => {
      const s = await api(
        "/settings",
        { ...identity, onboardingComplete: true },
        "PUT",
      );
      c.onSettingsSaved(s);
      return s;
    }, "Store ready");
    if (page) c.setPage(page);
  };
  return (
    <section className="card">
      <h2>Welcome to your store</h2>
      <p>
        Set the identity used on documents and messages, then choose how to
        begin. You can skip and import later.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          c.run(async () => {
            const s = await api("/settings", identity, "PUT");
            c.onSettingsSaved(s);
            return s;
          }, "Store identity saved").catch(() => {});
        }}
      >
        <div className="form-grid">
          {[
            ["storeName", "Store name"],
            ["address", "Store address"],
            ["phone", "Store contact number"],
          ].map(([k, label]) => (
            <Field
              key={k}
              label={label}
              required={k === "storeName"}
              value={(identity as any)[k]}
              set={(v: string) => setIdentity({ ...identity, [k]: v })}
            />
          ))}
        </div>
        <Button disabled={c.busy}>Save store identity</Button>
      </form>
      <div className="toolbar">
        <Button
          secondary
          disabled={c.busy}
          onClick={() => finish().catch(() => {})}
        >
          Start with a blank store / Skip onboarding
        </Button>
        <Button
          secondary
          disabled={c.busy}
          onClick={() => finish("Data Import & Migration").catch(() => {})}
        >
          Import existing Excel / CSV data
        </Button>
        <Button
          secondary
          disabled={c.busy}
          onClick={() =>
            c
              .run(async () => {
                await api("/settings", identity, "PUT");
                await api("/onboarding/demo", { confirm: true });
                const s = await api("/settings");
                c.onSettingsSaved(s);
                return s;
              }, "Demo data loaded by your request")
              .catch(() => {})
          }
        >
          Load demo/sample data into this empty store
        </Button>
      </div>
      <p>
        Suggested order: Store configuration, catalogue, suppliers, customers,
        opening stock, opening balances, optional historical records. Demo
        loading is refused when business records already exist.
      </p>
    </section>
  );
}
