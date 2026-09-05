"use client";

import { useEffect, useRef, useState } from "react";

export default function DeliveryLocationPicker({ value, onChange, disabled }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.L) {
      setReady(true);
      return;
    }

    const cssId = "leaflet-css-dhiman";
    if (!document.getElementById(cssId)) {
      const css = document.createElement("link");
      css.id = cssId;
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }

    const scriptId = "leaflet-js-dhiman";
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError("Unable to load the location map.");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;

    const L = window.L;
    const initial = value
      ? [Number(value.latitude), Number(value.longitude)]
      : [31.2847197, 76.2614544];

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(initial, value ? 17 : 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapInstance.current);

      markerRef.current = L.marker(initial, { draggable: !disabled }).addTo(mapInstance.current);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        onChange?.({
          latitude: p.lat,
          longitude: p.lng,
          accuracy: value?.accuracy ?? null,
          source: "pin",
        });
      });
    } else if (value) {
      const p = [Number(value.latitude), Number(value.longitude)];
      markerRef.current.setLatLng(p);
      mapInstance.current.setView(p, Math.max(mapInstance.current.getZoom(), 17));
    }

    if (disabled && markerRef.current?.dragging) {
      markerRef.current.dragging.disable();
    }
  }, [ready, disabled]);

  useEffect(() => {
    if (!ready || !mapInstance.current || !value || !markerRef.current) return;
    const lat = Number(value.latitude);
    const lng = Number(value.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    markerRef.current.setLatLng([lat, lng]);
    mapInstance.current.setView([lat, lng], Math.max(mapInstance.current.getZoom(), 17));
  }, [value, ready]);

  if (error) {
    return <div style={{ padding: 12, borderRadius: 10, background: "#fff0ee", color: "#9b3c32" }}>{error}</div>;
  }

  return (
    <div>
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 260,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid #d7e3db",
          background: "#edf2ee",
        }}
        aria-label="Delivery location map"
      />
      <div style={{ marginTop: 8, fontSize: 12, color: "#657168" }}>
        {value
          ? "📍 Location marked. Drag the pin to the exact entrance if needed."
          : "📍 Tap “Use my current GPS” first, then adjust the pin if necessary."}
      </div>
    </div>
  );
}
