#!/usr/bin/env python3
"""Sync official Univentis and Cipla product metadata into Supabase.

Source-specific records are reference metadata only. This script never changes
inventory, batch, MRP, GST, HSN, expiry, purchase/sale price, or quantity.
Matching is deliberately exact after normalization to avoid unsafe links.
"""
from __future__ import annotations
import json, os, re, sys, time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup

TIMEOUT = 30
DELAY = 0.2
UA = "DHIMAN-MEDICOS-Manufacturer-Metadata-Sync/1.0 (+https://dhiman-medicos-online.vercel.app/)"
UNIVENTIS_BASE = "https://www.univentismedicare.co.in/"
UNIVENTIS_URL = urljoin(UNIVENTIS_BASE, "products.php")
CIPLAMED_BASE = "https://www.ciplamed.com/"
CIPLAMED_INDEX = urljoin(CIPLAMED_BASE, "product-index")
CIPLA_PRODUCTS = "https://www.cipla.com/products"

def norm(v):
    v = (v or "").upper().replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", v)).strip()

def clean(v):
    if not v:
        return None
    v = re.sub(r"\s+", " ", str(v)).strip()
    return v or None

def get(s, url):
    r = s.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text

def robots_ok(base, urls):
    rp = RobotFileParser()
    rp.set_url(urljoin(base, "robots.txt"))
    try:
        rp.read()
    except Exception:
        return False
    return all(rp.can_fetch(UA, u) for u in urls)

def inventory_map(s, api, key):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    result, offset = {}, 0
    while True:
        r = s.get(f"{api}/rest/v1/inventory",
                  params={"select":"medicine_id,medicine_name","offset":offset,"limit":1000},
                  headers=h, timeout=TIMEOUT)
        r.raise_for_status()
        rows = r.json()
        for x in rows:
            if x.get("medicine_id") and x.get("medicine_name"):
                result[norm(x["medicine_name"])] = x["medicine_id"]
        if len(rows) < 1000:
            return result
        offset += 1000

def upsert(s, api, key, table, rows):
    if not rows:
        return
    now = datetime.now(timezone.utc).isoformat()
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates,return=minimal"}
    payload = [{**x, "fetched_at": now, "updated_at": now} for x in rows]
    for i in range(0, len(payload), 100):
        r = s.post(f"{api}/rest/v1/{table}", headers=h, json=payload[i:i+100], timeout=TIMEOUT)
        r.raise_for_status()

def univentis_products(html):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for card in soup.find_all(["div","article","li","section"]):
        txt = re.sub(r"\s+", " ", card.get_text(" ", strip=True))
        if "MRP" not in txt.upper() or "PACK SIZE" not in txt.upper() or len(txt) > 1200:
            continue
        name = None
        for tag in card.find_all(["h2","h3","h4","h5"], limit=4):
            t = clean(tag.get_text(" ", strip=True))
            if t and "MRP" not in t.upper() and "PACK SIZE" not in t.upper():
                name = t; break
        if not name:
            for a in card.find_all("a", href=True, limit=8):
                t = clean(a.get_text(" ", strip=True))
                if t and "MRP" not in t.upper() and "PACK SIZE" not in t.upper():
                    name = t; break
        if not name:
            continue
        m = re.search(r"MRP\s*₹?\s*([0-9][0-9,]*(?:\.[0-9]+)?)", txt, re.I)
        p = re.search(r"PACK\s*SIZE\s*[:\-]?\s*(.*?)(?=\s+MRP|$)", txt, re.I)
        mrp = None
        if m:
            try: mrp = float(m.group(1).replace(",",""))
            except ValueError: pass
        links = [urljoin(UNIVENTIS_BASE,a["href"]).split("#",1)[0].rstrip("/")
                 for a in card.find_all("a", href=True)]
        source = next((u for u in links if urlparse(u).netloc=="www.univentismedicare.co.in"), UNIVENTIS_URL)
        k=(norm(name),source)
        if k in seen: continue
        seen.add(k)
        out.append({"product_name":name,"source_url":source,
                    "manufacturer":"Univentis Medicare Limited",
                    "pack_size":clean(p.group(1)) if p else None,
                    "reference_mrp":mrp,
                    "raw_source":{"page_text":txt,"source_page":UNIVENTIS_URL}})
    return out

def sitemap_urls(s, candidates):
    out, seen = [], set()
    for u in candidates:
        try: root = ET.fromstring(get(s,u))
        except Exception: continue
        for el in root.iter():
            if el.tag.lower().endswith("loc") and el.text:
                x=el.text.strip()
                if x not in seen: seen.add(x); out.append(x)
    return out

def ciplamed_urls(s):
    out, seen = [], set()
    try:
        soup=BeautifulSoup(get(s,CIPLAMED_INDEX),"html.parser")
        for a in soup.find_all("a",href=True):
            u=urljoin(CIPLAMED_BASE,a["href"]).split("#",1)[0].rstrip("/")
            if urlparse(u).netloc=="www.ciplamed.com" and "/product-index/" in urlparse(u).path:
                if u not in seen: seen.add(u); out.append(u)
    except Exception: pass
    for u in sitemap_urls(s,[urljoin(CIPLAMED_BASE,"sitemap.xml"),urljoin(CIPLAMED_BASE,"sitemap_index.xml"),urljoin(CIPLAMED_BASE,"sitemap-products.xml")]):
        if "/product-index/" in urlparse(u).path and u not in seen:
            seen.add(u); out.append(u)
    return out

def labeled(text, labels):
    out={}
    for i,label in enumerate(labels):
        tail=labels[i+1:]
        nxt="|".join(re.escape(x) for x in tail)
        pattern=(rf"{re.escape(label)}\s*:?\s*(.*?)(?=\s*(?:{nxt})\s*:|$)" if nxt else rf"{re.escape(label)}\s*:?\s*(.*)$")
        m=re.search(pattern,text,re.I|re.S)
        out[label]=clean(m.group(1)) if m else None
    return out

def ciplamed_product(url, html):
    soup=BeautifulSoup(html,"html.parser")
    h1=soup.find("h1")
    title=clean(h1.get_text(" ",strip=True)) if h1 else None
    text=re.sub(r"\s+"," ",soup.get_text(" ",strip=True))
    d=labeled(text,["GENERIC NAME","BRAND NAME","QUANTITATIVE AND QUALITATIVE COMPOSITION","DOSAGE FORM AND STRENGTH","DESCRIPTION","PACKAGING INFORMATION","THERAPEUTIC INDICATION"])
    name=title or d["BRAND NAME"]
    return {"product_name":name,"source_url":url,"source_system":"ciplamed","manufacturer":"Cipla Limited",
            "brand_name":d["BRAND NAME"] or name,"molecule":d["GENERIC NAME"],
            "composition":d["QUANTITATIVE AND QUALITATIVE COMPOSITION"] or d["GENERIC NAME"],
            "formulation":d["DOSAGE FORM AND STRENGTH"],"dosage_form":d["DOSAGE FORM AND STRENGTH"],
            "description":d["DESCRIPTION"],"pack_size":d["PACKAGING INFORMATION"],
            "therapy":d["THERAPEUTIC INDICATION"],"product_page_url":url,"raw_source":d}

def cipla_corporate_links(html):
    soup=BeautifulSoup(html,"html.parser")
    out,seen=[],set()
    for a in soup.find_all("a",href=True):
        u=urljoin("https://www.cipla.com/",a["href"]).split("#",1)[0].rstrip("/")
        p=urlparse(u); t=clean(a.get_text(" ",strip=True))
        if p.netloc=="www.cipla.com" and "/products" in p.path and u!=CIPLA_PRODUCTS and t and u not in seen:
            seen.add(u); out.append({"product_name":t,"source_url":u,"source_system":"cipla","manufacturer":"Cipla Limited","product_page_url":u,"raw_source":{"source_page":CIPLA_PRODUCTS,"link_text":t}})
    return out

def main():
    api=os.environ.get("SUPABASE_URL","").rstrip("/"); key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
    if not api or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",file=sys.stderr); return 2
    s=requests.Session(); s.headers.update({"User-Agent":UA,"Accept":"text/html,application/xhtml+xml"})
    inv=inventory_map(s,api,key); print(f"Inventory medicine names available: {len(inv)}")
    univ=[]; cipla=[]; uu=[]; cu=[]
    if robots_ok(UNIVENTIS_BASE,[UNIVENTIS_URL]):
        try:
            products=univentis_products(get(s,UNIVENTIS_URL)); print(f"Univentis products discovered in page HTML: {len(products)}")
            for p in products:
                mid=inv.get(norm(p["product_name"]))
                if mid: univ.append({**p,"medicine_id":mid,"match_method":"exact_normalized_name","match_confidence":1})
                else: uu.append({"product_name":p["product_name"],"source_url":p["source_url"]})
        except Exception as e: print(f"WARN Univentis: {e}",file=sys.stderr)
    else: print("Univentis robots.txt disallows sync or could not be read.",file=sys.stderr)
    if robots_ok(CIPLAMED_BASE,[CIPLAMED_INDEX]):
        try:
            urls=ciplamed_urls(s); print(f"CiplaMed product URLs discovered: {len(urls)}")
            for i,u in enumerate(urls,1):
                try:
                    p=ciplamed_product(u,get(s,u)); mid=inv.get(norm(p.get("product_name"))) or inv.get(norm(p.get("brand_name")))
                    if mid: cipla.append({**p,"medicine_id":mid,"match_method":"exact_normalized_name","match_confidence":1})
                    else: cu.append({"product_name":p.get("product_name"),"brand_name":p.get("brand_name"),"source_url":u})
                except Exception as e: print(f"WARN CiplaMed product {u}: {e}",file=sys.stderr)
                if i%25==0: print(f"CiplaMed processed {i}/{len(urls)}")
                time.sleep(DELAY)
        except Exception as e: print(f"WARN CiplaMed: {e}",file=sys.stderr)
    else: print("CiplaMed robots.txt disallows sync or could not be read.",file=sys.stderr)
    if robots_ok("https://www.cipla.com/",[CIPLA_PRODUCTS]):
        try:
            links=cipla_corporate_links(get(s,CIPLA_PRODUCTS)); print(f"Cipla corporate product links discovered: {len(links)}")
            for p in links:
                mid=inv.get(norm(p["product_name"]))
                if mid: cipla.append({**p,"medicine_id":mid,"match_method":"exact_normalized_name","match_confidence":1})
        except Exception as e: print(f"WARN Cipla corporate: {e}",file=sys.stderr)
    else: print("Cipla corporate robots.txt disallows sync or could not be read.",file=sys.stderr)
    upsert(s,api,key,"univentis_product_metadata",univ); upsert(s,api,key,"cipla_product_metadata",cipla)
    with open("univentis-manufacturer-unmatched.json","w",encoding="utf-8") as f: json.dump(uu,f,ensure_ascii=False,indent=2)
    with open("cipla-manufacturer-unmatched.json","w",encoding="utf-8") as f: json.dump(cu,f,ensure_ascii=False,indent=2)
    print(f"Univentis matched/upserted: {len(univ)}"); print(f"Cipla matched/upserted: {len(cipla)}")
    return 0
if __name__=="__main__": raise SystemExit(main())
