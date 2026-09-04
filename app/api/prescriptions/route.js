import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "prescriptions";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeFilename(name) {
  return String(name || "prescription")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

function getMimeType(file) {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) {
    return file.type;
  }

  const extension = String(file.name || "")
    .split(".")
    .pop()
    .toLowerCase();

  return MIME_BY_EXTENSION[extension] || "";
}

/* =========================================================
   UPLOAD PRESCRIPTION
========================================================= */

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        {
          success: false,
          error: "Please select a prescription file.",
        },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The prescription file is empty.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Prescription must be 10 MB or smaller.",
        },
        { status: 400 }
      );
    }

    const mimeType = getMimeType(file);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported prescription format. Use JPG, PNG, WebP, HEIC, HEIF or PDF.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Hash the exact bytes that will be stored.
    const sha256 = createHash("sha256")
      .update(buffer)
      .digest("hex");

    const originalFilename = String(
      file.name || "prescription"
    );

    const storedFilename =
      `${Date.now()}-${randomUUID()}-${safeFilename(originalFilename)}`;

    const filePath = `uploads/${storedFilename}`;

    const supabase = getSupabaseAdmin();

    /* -------------------------------------------------------
       Store ORIGINAL file bytes
    ------------------------------------------------------- */

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      console.error(
        "Prescription storage error:",
        uploadError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Failed to store prescription.",
        },
        { status: 500 }
      );
    }

    /* -------------------------------------------------------
       Store metadata
    ------------------------------------------------------- */

    const { data, error: dbError } = await supabase
      .from("prescriptions")
      .insert({
        file_path: filePath,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size: file.size,
        sha256,
        status: "pending",
      })
      .select(
        "id, original_filename, mime_type, file_size, sha256, status, created_at"
      )
      .single();

    if (dbError) {
      // Remove orphaned storage file if DB insert fails.
      await supabase.storage
        .from(BUCKET)
        .remove([filePath]);

      console.error(
        "Prescription metadata error:",
        dbError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Prescription metadata could not be saved.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      prescription: data,
    });
  } catch (error) {
    console.error(
      "Prescription upload error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Prescription upload failed.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   GET ORIGINAL PRESCRIPTION
   Returns a short-lived signed URL.
========================================================= */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const id = Number(
      searchParams.get("id")
    );

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid prescription ID.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("prescriptions")
      .select(
        "id, file_path, original_filename, mime_type, file_size, sha256, status, created_at, sale_id"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: "Prescription not found.",
        },
        { status: 404 }
      );
    }

    const { data: signed, error: signedError } =
      await supabase.storage
        .from(BUCKET)
        .createSignedUrl(
          data.file_path,
          300
        );

    if (signedError) {
      throw signedError;
    }

    return NextResponse.json({
      success: true,
      prescription: {
        ...data,
        url: signed.signedUrl,
      },
    });
  } catch (error) {
    console.error(
      "Prescription retrieval error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to open prescription.",
      },
      { status: 500 }
    );
  }
            }
