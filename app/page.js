"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./storefront.module.css";

const STORE_CART_KEY = "dm-online-cart";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [price, setPrice] = useState("all");
  const [type, setType] = useState("all");
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [installVisible, setInstallVisible] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(STORE_CART_KEY) || "{}"));
    } catch {}

    fetch("/api/online-orders/catalog", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || "Unable to load medicines.");
        setProducts(d.products || []);
      })
      .catch((e) => setMessage(e.message || "Unable to load medicines."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE_CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);

  const categories = useMemo(() => {
    const seen = new Set();
    return products.filter((p) => {
      if (seen.has(p.category_id)) return false;
      seen.add(p.category_id);
      return true;
    }).map((p) => ({ id: p.category_id, name: p.category, icon: p.category_icon }));
  }, [products]);

  const filtered = useMemo(() => products.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || p.name.toLowerCase().includes(q);
    const matchesCategory = category === "all" || p.category_id === category;
    const selling = Number(p.selling_price ?? p.mrp);
    const matchesPrice = price === "all"
      || (price === "under50" && selling < 50)
      || (price === "50to200" && selling >= 50 && selling <= 200)
      || (price === "200plus" && selling > 200);
    const matchesType = type === "all"
      || (type === "rx" && p.prescription)
      || (type === "otc" && !p.prescription);
    return matchesQuery && matchesCategory && matchesPrice && matchesType;
  }), [products, query, category, price, type]);

  const cartCount = Object.values(cart).reduce((n, v) => n + Number(v || 0), 0);

  function add(p, delta = 1) {
    if (!p.in_stock) return;
    setCart((old) => {
      const next = { ...old };
      const qty = Math.max(0, Math.min(20, Number(next[p.id] || 0) + delta));
      if (qty) next[p.id] = qty;
      else delete next[p.id];
      return next;
    });
  }

  return (
    <main className={styles.storefront}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brandMark} aria-label="Dhiman Medicos home">DM</Link>
        <Link href="/online-order" className={styles.salesBtn}>📋 <span>Sales</span></Link>
        <Link href="/online-order" className={styles.cartBtn} aria-label="Open cart">
          🛒{cartCount > 0 && <b>{cartCount}</b>}
        </Link>
        <button className={styles.themeBtn} type="button" aria-label="Theme">☾</button>
      </header>

      <div className={styles.searchWrap}>
        <span>🔎</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${products.length || ""}+ medicines…`} />
      </div>

      <section className={styles.hero}>
        <div className={styles.heroPattern} />
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>DHIMAN MEDICOS</div>
          <h1>Dhiman Medicos</h1>
          <p>Your Trusted Medical Store · Binewal, Hoshiarpur, Punjab</p>
          <div className={styles.stats}>
            <div><strong>{products.length || "1370+"}</strong><span>MEDICINES</span></div>
            <div><strong>{categories.length || 21}</strong><span>CATEGORIES</span></div>
            <div><strong>24/7</strong><span>WHATSAPP</span></div>
          </div>
          <div className={styles.rxBanner}>⚠️ Prescription medicines require a valid doctor prescription.</div>
        </div>
      </section>

      <section className={styles.filters}>
        <FilterRow label="💰 PRICE" value={price} setValue={setPrice} items={[["all","All"],["under50","Under ₹50"],["50to200","₹50–200"],["200plus","₹200+"]]} />
        <FilterRow label="🏥 TYPE" value={type} setValue={setType} items={[["all","All"],["otc","OTC"],["rx","Rx Only"]]} />
      </section>

      <section className={styles.categoryGrid}>
        <button className={category === "all" ? `${styles.category} ${styles.active}` : styles.category} onClick={() => setCategory("all")}>All Medicines</button>
        {categories.map((c) => (
          <button key={c.id} className={category === c.id ? `${styles.category} ${styles.active}` : styles.category} onClick={() => setCategory(c.id)}>
            {c.icon || "💊"} {c.name}
          </button>
        ))}
      </section>

      {message && <div className={styles.message}>{message}</div>}
      {loading ? <div className={styles.loading}>Loading medicines…</div> : (
        <section className={styles.products}>
          {filtered.slice(0, 80).map((p) => {
            const qty = Number(cart[p.id] || 0);
            const selling = Number(p.selling_price ?? p.mrp);
            const hasDiscount = Number(p.discount_amount || 0) > 0;
            return (
              <article className={styles.productCard} key={p.id}>
                <div className={styles.productIcon}>{p.category_icon || "💊"}</div>
                <div className={styles.productName}>{p.name}</div>
                <div className={styles.productMeta}>{p.prescription ? "Rx only" : "OTC"}</div>
                <div className={styles.productStock}>{p.in_stock ? "● In stock" : "● Unavailable"}</div>
                <div className={styles.priceLine}>
                  <strong>₹{selling.toFixed(2)}</strong>
                  {hasDiscount && <><del>₹{Number(p.mrp).toFixed(2)}</del><em>{p.discount_percent}% OFF</em></>}
                </div>
                {p.in_stock && (
                  qty ? (
                    <div className={styles.qtyControl}><button onClick={() => add(p, -1)}>−</button><b>{qty}</b><button onClick={() => add(p, 1)}>+</button></div>
                  ) : <button className={styles.addBtn} onClick={() => add(p)}>ADD</button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {!loading && filtered.length === 0 && <div className={styles.empty}>No medicines found. Try another search or filter.</div>}

      <div className={styles.storeLinks}><Link href="/account">My Account</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>

      {installVisible && (
        <div className={styles.installBanner}>
          <div><strong>Install Dhiman Medicos</strong><span>Get faster access like a real app.</span></div>
          <button type="button" onClick={async () => { if (installPrompt) { await installPrompt.prompt(); setInstallPrompt(null); } else { setInstallVisible(false); } }}>Install</button>
          <button className={styles.dismiss} type="button" onClick={() => setInstallVisible(false)} aria-label="Close">×</button>
        </div>
      )}
    </main>
  );
}

function FilterRow({ label, value, setValue, items }) {
  return <div className={styles.filterRow}><strong>{label}</strong>{items.map(([id, text]) => <button key={id} className={value === id ? `${styles.filter} ${styles.active}` : styles.filter} onClick={() => setValue(id)}>{text}</button>)}</div>;
}
