"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function CustomerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/online-order";
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/online-order";

  useEffect(() => {
    let active = true;
    getSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (active && data.user) router.replace(safeNext);
    }).catch(() => {});
    return () => { active = false; };
  }, [router, safeNext]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const cleanEmail = email.trim().toLowerCase();
      if (mode === "signup") {
        const cleanPhone = phone.replace(/[^0-9+]/g, "");
        if (name.trim().length < 2) throw new Error("Please enter your name.");
        if (!/^[0-9+]{10,15}$/.test(cleanPhone)) throw new Error("Please enter a valid mobile number.");
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: name.trim(), phone: cleanPhone } },
        });
        if (error) throw error;
        if (!data.session) {
          setMode("login");
          setMessage("Account created. Check your email to verify it, then sign in.");
        } else {
          router.replace(safeNext);
          router.refresh();
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setMessage(err?.message || "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={s.page}>
      <section style={s.card}>
        <Link href="/" style={s.brand}>DHIMAN MEDICOS</Link>
        <h1 style={s.title}>{mode === "login" ? "Customer sign in" : "Create account"}</h1>
        <p style={s.muted}>Sign in to place online medicine orders and view your order history.</p>
        <form onSubmit={submit} style={s.form}>
          {mode === "signup" && <>
            <input style={s.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" autoComplete="name" required />
            <input style={s.input} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" autoComplete="tel" required />
          </>}
          <input style={s.input} value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email address" autoComplete="email" required />
          <input style={s.input} value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          {message && <div style={s.notice}>{message}</div>}
          <button disabled={busy} style={s.primary}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <div style={s.switch}>{mode === "login" ? <>New customer? <button style={s.link} onClick={()=>{setMode("signup");setMessage("")}}>Create an account</button></> : <>Already registered? <button style={s.link} onClick={()=>{setMode("login");setMessage("")}}>Sign in</button></>}</div>
        <Link href="/online-order" style={s.back}>← Back to medicines</Link>
      </section>
    </main>
  );
}
const s={page:{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"#f3f8f5",fontFamily:"system-ui,sans-serif"},card:{width:"min(100%,430px)",padding:28,borderRadius:22,background:"white",border:"1px solid #dfe8e2",boxShadow:"0 18px 50px rgba(25,60,45,.10)"},brand:{fontSize:12,fontWeight:900,letterSpacing:2,color:"#087f5b",textDecoration:"none"},title:{fontSize:30,margin:"14px 0 6px"},muted:{color:"#6d7b73",lineHeight:1.5},form:{display:"grid",gap:12,marginTop:20},input:{width:"100%",boxSizing:"border-box",padding:13,border:"1px solid #d7e1dc",borderRadius:12,fontSize:16},primary:{padding:13,border:0,borderRadius:12,background:"#087f5b",color:"white",fontWeight:900,fontSize:16},notice:{padding:11,borderRadius:10,background:"#f1f7f3",color:"#205d45",fontSize:13,lineHeight:1.4},switch:{marginTop:18,color:"#66736c",fontSize:14},link:{border:0,background:"none",padding:0,color:"#087f5b",fontWeight:800},back:{display:"block",marginTop:16,color:"#087f5b",fontSize:13,textDecoration:"none"}};
