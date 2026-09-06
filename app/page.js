"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./storefront.module.css";

const STORE_CART_KEY = "dm-online-cart";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [price, setPrice] = useState("all");
  const [type, setType] = useState("all");
  const [cart, setCart] = useState({});
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(false);
  const [installVisible, setInstallVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSupabaseBrowserClient().auth.getUser()
      .then(({ data }) => setUser(data?.user || null))
      .catch(() => {});

    try {
      setDark(localStorage.getItem("dm-theme") === "dark");
      setCart(JSON.parse(localStorage.getItem(STORE_CART_KEY) || "{}"));
    } catch {}

    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    fetch("/api/online-orders/catalog", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load medicines.");
        }
        setProducts(data.products || []);
      })
      .catch((error) => setMessage(error.message || "Unable to load medicines."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_CART_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const categories = useMemo(() => {
    const seen = new Set();
    return products
      .filter((p) => {
        if (seen.has(p.category_id)) return false;
        seen.add(p.category_id);
        return true;
      })
      .map((p) => ({
        id: p.category_id,
        name: p.category,
        icon: p.category_icon,
      }));
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = query.trim().toLowerCase();
      const selling = Number(p.selling_price ?? p.mrp);

      return (
        (!q || p.name.toLowerCase().includes(q)) &&
        (category === "all" || p.category_id === category) &&
        (
          price === "all" ||
          (price === "under50" && selling < 50) ||
          (price === "50to200" && selling >= 50 && selling <= 200) ||
          (price === "200plus" && selling > 200)
        ) &&
        (
          type === "all" ||
          (type === "rx" && p.prescription) ||
          (type === "otc" && !p.prescription)
        )
      );
    });
  }, [products, query, category, price, type]);

  const cartCount = Object.values(cart).reduce(
    (total, value) => total + Number(value || 0),
    0
  );

  const cartTotal = Object.entries(cart).reduce((total, [id, qty]) => {
    const product = products.find((item) => item.id === id);
    return total + (product ? Number(product.selling_price ?? product.mrp) * Number(qty) : 0);
  }, 0);

  function add(product, delta = 1) {
    if (!product.in_stock) return;

    setCart((current) => {
      const next = { ...current };
      const quantity = Math.max(
        0,
        Math.min(20, Number(next[product.id] || 0) + delta)
      );

      if (quantity) next[product.id] = quantity;
      else delete next[product.id];

      return next;
    });
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem("dm-theme", next ? "dark" : "light");
    } catch {}
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallVisible(false);
      return;
    }

    await installPrompt.prompt();
    setInstallPrompt(null);
    setInstallVisible(false);
  }

  return (
    <main className={`${styles.storefront} ${dark ? styles.dark : ""}`}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brandMark} aria-label="Dhiman Medicos home">
          DM
        </Link>

        <Link href="/online-order" className={styles.salesBtn}>
          <span>📋</span>
          <span>Sales</span>
        </Link>

        <Link href="/online-order" className={styles.cartBtn} aria-label="Open cart">
          🛒
          {cartCount > 0 && <b>{cartCount}</b>}
        </Link>

        <Link
          href={user ? "/account" : "/login?next=/"}
          className={styles.accountBtn}
          aria-label={user ? "My account" : "Sign in"}
        >
          👤
        </Link>

        <button
          className={styles.themeBtn}
          type="button"
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          {dark ? "☀" : "☾"}
        </button>
      </header>

      <div className={styles.searchWrap}>
        <span aria-hidden="true">🔎</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${products.length || "1370+"} medicines…`}
          aria-label="Search medicines"
        />
      </div>

      <section className={styles.hero}>
        <div className={styles.heroPattern} />
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>DHIMAN MEDICOS</div>
          <h1>Dhiman Medicos</h1>
          <p>Your Trusted Medical Store · Binewal, Hoshiarpur, Punjab</p>

          <div className={styles.stats}>
            <div>
              <strong>{products.length || "1370+"}</strong>
              <span>MEDICINES</span>
            </div>
            <div>
              <strong>{categories.length || 21}</strong>
              <span>CATEGORIES</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>WHATSAPP</span>
            </div>
          </div>

          <div className={styles.rxBanner}>
            ⚠️ Prescription medicines require a valid doctor prescription.
          </div>
        </div>
      </section>

      <section className={styles.filters}>
        <FilterRow
          label="💰 PRICE"
          value={price}
          setValue={setPrice}
          items={[
            ["all", "All"],
            ["under50", "Under ₹50"],
            ["50to200", "₹50–200"],
            ["200plus", "₹200+"],
          ]}
        />

        <FilterRow
          label="🏥 TYPE"
          value={type}
          setValue={setType}
          items={[
            ["all", "All"],
            ["otc", "OTC"],
            ["rx", "Rx Only"],
          ]}
        />
      </section>

      <section className={styles.categoryGrid}>
        <button
          className={`${styles.category} ${category === "all" ? styles.active : ""}`}
          onClick={() => setCategory("all")}
        >
          All Medicines
        </button>

        {categories.map((item) => (
          <button
            key={item.id}
            className={`${styles.category} ${category === item.id ? styles.active : ""}`}
            onClick={() => setCategory(item.id)}
          >
            {item.icon || "💊"} {item.name}
          </button>
        ))}
      </section>

      {message && <div className={styles.message}>{message}</div>}

      {loading ? (
        <div className={styles.loading}>Loading medicines…</div>
      ) : filtered.length ? (
        <section className={styles.products}>
          {filtered.slice(0, 80).map((product) => {
            const quantity = Number(cart[product.id] || 0);
            const selling = Number(product.selling_price ?? product.mrp);
            const hasDiscount = Number(product.discount_amount || 0) > 0;

            return (
              <article className={styles.productCard} key={product.id}>
                <div className={styles.productIcon}>
                  {product.category_icon || "💊"}
                </div>

                <div className={styles.productName}>{product.name}</div>

                <div className={styles.productMeta}>
                  {product.prescription ? "Rx only" : "OTC"}
                </div>

                <div className={styles.productStock}>
                  {product.in_stock ? "● In stock" : "● Currently unavailable"}
                </div>

                <div className={styles.priceLine}>
                  <strong>₹{selling.toFixed(2)}</strong>

                  {hasDiscount && (
                    <>
                      <del>₹{Number(product.mrp).toFixed(2)}</del>
                      <em>{product.discount_percent}% OFF</em>
                    </>
                  )}
                </div>

                {product.in_stock &&
                  (quantity ? (
                    <div className={styles.qtyControl}>
                      <button onClick={() => add(product, -1)} aria-label="Decrease quantity">
                        −
                      </button>
                      <b>{quantity}</b>
                      <button onClick={() => add(product, 1)} aria-label="Increase quantity">
                        +
                      </button>
                    </div>
                  ) : (
                    <button className={styles.addBtn} onClick={() => add(product)}>
                      ADD
                    </button>
                  ))}
              </article>
            );
          })}
        </section>
      ) : (
        <div className={styles.empty}>
          No medicines found. Try another search or filter.
        </div>
      )}

      <section className={styles.quickActions}>
        <Link href="/account">
          👤 <span>{user ? "My Account" : "Sign in"}</span>
        </Link>
        <Link href="/online-order">
          🛒 <span>Cart {cartCount ? `(${cartCount})` : ""}</span>
        </Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </section>

      {cartCount > 0 && (
        <Link href="/online-order" className={styles.floatingCart}>
          <span>{cartCount} item{cartCount === 1 ? "" : "s"}</span>
          <strong>₹{cartTotal.toFixed(2)}</strong>
          <span>View cart →</span>
        </Link>
      )}

      {installVisible && (
        <div className={styles.installBanner}>
          <div>
            <strong>Install Dhiman Medicos</strong>
            <span>Get faster access like a real app.</span>
          </div>

          <button type="button" onClick={installApp}>
            Install
          </button>

          <button
            className={styles.dismiss}
            type="button"
            onClick={() => setInstallVisible(false)}
            aria-label="Close install prompt"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

function FilterRow({ label, value, setValue, items }) {
  return (
    <div className={styles.filterRow}>
      <strong>{label}</strong>
      {items.map(([id, text]) => (
        <button
          key={id}
          className={`${styles.filter} ${value === id ? styles.active : ""}`}
          onClick={() => setValue(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
