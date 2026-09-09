"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  getSupabaseBrowserClient,
} from "../../lib/supabase-browser";

export default function CustomerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const safeNext = (() => {
    const next =
      searchParams.get("next") ||
      "/online-order";

    return next.startsWith("/") &&
      !next.startsWith("//")
      ? next
      : "/online-order";
  })();

  const [mode, setMode] =
    useState("login");

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    getSupabaseBrowserClient()
      .auth
      .getUser()
      .then(({ data }) => {
        if (
          active &&
          data?.user
        ) {
          router.replace(
            safeNext
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [
    router,
    safeNext,
  ]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage("");
  }

  function cleanPhoneNumber(value) {
    return String(value || "")
      .replace(/[^0-9+]/g, "")
      .slice(0, 15);
  }

  async function submit(event) {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      const sb =
        getSupabaseBrowserClient();

      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      if (!cleanEmail) {
        throw new Error(
          "Please enter your email address."
        );
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          cleanEmail
        )
      ) {
        throw new Error(
          "Please enter a valid email address."
        );
      }

      if (
        password.length < 6
      ) {
        throw new Error(
          "Password must be at least 6 characters."
        );
      }

      if (
        mode === "signup"
      ) {
        const cleanName =
          name.trim();

        const cleanPhone =
          cleanPhoneNumber(
            phone
          );

        if (
          cleanName.length < 2
        ) {
          throw new Error(
            "Please enter your full name."
          );
        }

        if (
          !/^[0-9+]{10,15}$/.test(
            cleanPhone
          )
        ) {
          throw new Error(
            "Please enter a valid mobile number."
          );
        }

        const {
          data,
          error,
        } =
          await sb.auth.signUp({
            email:
              cleanEmail,
            password,
            options: {
              data: {
                full_name:
                  cleanName,
                phone:
                  cleanPhone,
              },
            },
          });

        if (error) {
          throw error;
        }

        /*
         * The Supabase database trigger automatically
         * creates/synchronizes customer_profiles using
         * the Auth user's full_name and phone metadata.
         */

        if (data?.session) {
          router.replace(
            safeNext
          );
          router.refresh();
        } else {
          setMode("login");

          setName("");
          setPhone("");
          setPassword("");

          setMessage(
            "Account created successfully. Check your email to verify your account, then sign in."
          );
        }

        return;
      }

      const {
        error,
      } =
        await sb.auth.signInWithPassword({
          email:
            cleanEmail,
          password,
        });

      if (error) {
        throw error;
      }

      router.replace(
        safeNext
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error?.message ||
          "Unable to continue."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={s.page}>
      <div style={s.greenTop} />

      <section style={s.card}>
        <Link
          href="/"
          style={s.brand}
        >
          <span style={s.logo}>
            DM
          </span>

          <span>
            DHIMAN MEDICOS
          </span>
        </Link>

        <div style={s.kicker}>
          CUSTOMER ACCOUNT
        </div>

        <h1 style={s.title}>
          {mode === "login"
            ? "Welcome back"
            : "Create your account"}
        </h1>

        <p style={s.muted}>
          {mode === "login"
            ? "Order medicines, track orders and manage your delivery details."
            : "Create an account to keep your profile and orders in one place."}
        </p>

        <div style={s.tabs}>
          <button
            type="button"
            onClick={() =>
              switchMode(
                "login"
              )
            }
            style={
              mode === "login"
                ? s.activeTab
                : s.tab
            }
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={() =>
              switchMode(
                "signup"
              )
            }
            style={
              mode === "signup"
                ? s.activeTab
                : s.tab
            }
          >
            Create account
          </button>
        </div>

        <form
          onSubmit={submit}
          style={s.form}
        >
          {mode ===
            "signup" && (
            <>
              <label
                style={s.label}
              >
                Full name

                <input
                  style={s.input}
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target
                        .value
                    )
                  }
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                  minLength={2}
                />
              </label>

              <label
                style={s.label}
              >
                Mobile number
                <span
                  style={
                    s.required
                  }
                >
                  *
                </span>

                <input
                  style={s.input}
                  value={phone}
                  onChange={(event) =>
                    setPhone(
                      cleanPhoneNumber(
                        event.target
                          .value
                      )
                    )
                  }
                  placeholder="10-digit mobile number"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  minLength={10}
                  maxLength={15}
                  aria-required="true"
                />

                <span
                  style={
                    s.fieldHint
                  }
                >
                  Required for customer
                  account and order contact.
                </span>
              </label>
            </>
          )}

          <label
            style={s.label}
          >
            Email address

            <input
              style={s.input}
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target
                    .value
                )
              }
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label
            style={s.label}
          >
            Password

            <input
              style={s.input}
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target
                    .value
                )
              }
              type="password"
              placeholder="Minimum 6 characters"
              minLength={6}
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              required
            />
          </label>

          {message && (
            <div
              style={
                s.notice
              }
              role="alert"
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              ...s.primary,
              opacity: busy
                ? 0.65
                : 1,
              cursor: busy
                ? "wait"
                : "pointer",
            }}
          >
            {busy
              ? "Please wait…"
              : mode === "login"
              ? "Sign in securely"
              : "Create account"}
          </button>
        </form>

        <div
          style={
            s.features
          }
        >
          <span>
            🛒 Easy ordering
          </span>

          <span>
            📦 Order tracking
          </span>

          <span>
            🔒 Secure account
          </span>
        </div>

        <div
          style={
            s.legal
          }
        >
          By continuing, you agree
          to our{" "}
          <Link
            href="/terms"
            style={s.link}
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            style={s.link}
          >
            Privacy Policy
          </Link>
          .
        </div>

        <Link
          href="/online-order"
          style={s.back}
        >
          ← Back to medicines
        </Link>
      </section>
    </main>
  );
}

const s = {
  page: {
    minHeight:
      "100vh",
    display: "grid",
    placeItems:
      "center",
    position:
      "relative",
    overflow:
      "hidden",
    padding:
      "28px 16px",
    background:
      "#eef6f1",
    fontFamily:
      "Inter,system-ui,sans-serif",
    color:
      "#16251d",
  },

  greenTop: {
    position:
      "absolute",
    inset:
      "0 0 auto 0",
    height: 220,
    background:
      "#075f46",
  },

  card: {
    position:
      "relative",
    zIndex: 1,
    width:
      "min(100%,460px)",
    padding:
      "26px 22px 22px",
    borderRadius: 26,
    background:
      "#fff",
    border:
      "1px solid #dbe8e1",
    boxShadow:
      "0 20px 60px rgba(15,63,43,.16)",
  },

  brand: {
    display:
      "inline-flex",
    alignItems:
      "center",
    gap: 10,
    color:
      "#075f46",
    textDecoration:
      "none",
    fontWeight: 900,
    letterSpacing:
      1.5,
    fontSize: 13,
  },

  logo: {
    display:
      "grid",
    placeItems:
      "center",
    width: 46,
    height: 46,
    borderRadius: 14,
    background:
      "#075f46",
    color: "#fff",
    fontSize: 17,
  },

  kicker: {
    marginTop: 22,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: 900,
    color:
      "#07805c",
  },

  title: {
    fontSize:
      "clamp(30px,8vw,40px)",
    lineHeight:
      1.05,
    margin:
      "8px 0",
    letterSpacing:
      "-.035em",
  },

  muted: {
    color:
      "#687870",
    lineHeight:
      1.55,
    margin: 0,
  },

  tabs: {
    display:
      "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 5,
    padding: 5,
    background:
      "#eff5f1",
    borderRadius: 14,
    marginTop: 20,
  },

  tab: {
    border: 0,
    background:
      "transparent",
    padding:
      "11px 8px",
    borderRadius: 10,
    fontWeight: 800,
    color:
      "#607068",
    cursor:
      "pointer",
  },

  activeTab: {
    border: 0,
    background:
      "#fff",
    padding:
      "11px 8px",
    borderRadius: 10,
    fontWeight: 900,
    color:
      "#075f46",
    boxShadow:
      "0 2px 9px rgba(15,63,43,.08)",
    cursor:
      "pointer",
  },

  form: {
    display:
      "grid",
    gap: 12,
    marginTop: 17,
  },

  label: {
    display:
      "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    color:
      "#506057",
  },

  required: {
    color:
      "#c0392b",
    marginLeft: 2,
  },

  fieldHint: {
    fontSize: 11,
    color:
      "#7a867f",
    fontWeight: 500,
    marginTop: -2,
  },

  input: {
    width:
      "100%",
    boxSizing:
      "border-box",
    padding:
      "13px 14px",
    border:
      "1px solid #d5e1da",
    borderRadius: 13,
    fontSize: 16,
    background:
      "#fff",
    outline:
      "none",
  },

  primary: {
    padding: 14,
    border: 0,
    borderRadius: 13,
    background:
      "#07805c",
    color: "white",
    fontWeight: 900,
    fontSize: 16,
  },

  notice: {
    padding: 12,
    borderRadius: 12,
    background:
      "#eff8f3",
    color:
      "#245d47",
    fontSize: 13,
    lineHeight:
      1.45,
    border:
      "1px solid #d2e7da",
  },

  features: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(3,1fr)",
    gap: 6,
    marginTop: 17,
    fontSize: 11,
    color:
      "#687870",
    textAlign:
      "center",
  },

  legal: {
    marginTop: 17,
    textAlign:
      "center",
    fontSize: 11,
    color:
      "#7a867f",
    lineHeight:
      1.5,
  },

  link: {
    color:
      "#075f46",
    fontWeight: 800,
    textDecoration:
      "none",
  },

  back: {
    display:
      "block",
    marginTop: 16,
    textAlign:
      "center",
    color:
      "#075f46",
    fontSize: 13,
    fontWeight: 800,
    textDecoration:
      "none",
  },
};
