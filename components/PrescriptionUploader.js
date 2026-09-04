"use client";

import { useRef, useState } from "react";

export default function PrescriptionUploader({
  prescription,
  onChange,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file) => {
    if (!file) return;

    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/prescriptions", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Prescription upload failed."
        );
      }

      onChange(result.prescription);
    } catch (err) {
      console.error("Prescription upload:", err);

      setError(
        err?.message || "Unable to upload prescription."
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const chooseFile = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const remove = () => {
    if (disabled || uploading) return;
    onChange(null);
    setError("");
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 12,
        border: "1px solid rgba(7,95,70,.25)",
        background: "rgba(7,95,70,.06)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        📋 Prescription
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.75,
          marginBottom: 10,
        }}
      >
        Required for prescription medicines. The original
        file is stored without resizing or conversion.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="
          image/jpeg,
          image/png,
          image/webp,
          image/heic,
          image/heif,
          application/pdf
        "
        capture="environment"
        style={{ display: "none" }}
        disabled={disabled || uploading}
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {!prescription ? (
        <button
          type="button"
          onClick={chooseFile}
          disabled={disabled || uploading}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: 0,
            borderRadius: 9,
            background: "#075f46",
            color: "#fff",
            fontWeight: 700,
            cursor: disabled || uploading
              ? "not-allowed"
              : "pointer",
            opacity: disabled || uploading ? 0.65 : 1,
          }}
        >
          {uploading
            ? "⏳ Uploading..."
            : "📷 Upload Prescription"}
        </button>
      ) : (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 8,
              background: "rgba(0,128,0,.08)",
            }}
          >
            <span style={{ fontSize: 24 }}>
              {prescription.mime_type === "application/pdf"
                ? "📄"
                : "🖼️"}
            </span>

            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {prescription.original_filename}
              </div>

              <div
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                  marginTop: 2,
                }}
              >
                ✓ Stored securely · Original file
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={chooseFile}
              disabled={disabled || uploading}
              style={{
                flex: 1,
                padding: 9,
                borderRadius: 8,
                border: "1px solid #075f46",
                background: "transparent",
                color: "inherit",
                fontWeight: 600,
              }}
            >
              🔄 Replace
            </button>

            <button
              type="button"
              onClick={remove}
              disabled={disabled || uploading}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid #c62828",
                background: "transparent",
                color: "#c62828",
                fontWeight: 600,
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            color: "#c62828",
            fontSize: 12,
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
          }
