import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const BUCKET = "prescriptions";
const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function getAdminClient() {
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

function cleanFilename(name) {
  return String(name || "prescription")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 150);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        {
          success: false,
          error: "No prescription file selected.",
        },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The selected file is empty.",
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

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported file. Use JPG, PNG, WebP, HEIC, HEIF or PDF.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Hash the exact original bytes.
    const sha256 = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const originalFilename = cleanFilename(file.name);

    const filePath =
      `uploads/${Date.now()}-${crypto.randomUUID()}-${originalFilename}`;

    const supabase = getAdminClient();

    /*
     * IMPORTANT:
     * Upload the original bytes.
     * No resize.
     * No compression.
     * No conversion.
     */
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      console.error("Prescription storage error:", uploadError);

      return NextResponse.json(
        {
          success: false,
          error: "Unable to store prescription.",
        },
        { status: 500 }
      );
    }

    const { data, error: databaseError } = await supabase
      .from("prescriptions")
      .insert({
        file_path: filePath,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        sha256,
        status: "pending",
      })
      .select(
        "id, original_filename, mime_type, file_size, sha256, status, created_at"
      )
      .single();

    if (databaseError) {
      // Remove the uploaded file if metadata creation fails.
      await supabase.storage
        .from(BUCKET)
        .remove([filePath]);

      console.error(
        "Prescription database error:",
        databaseError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to save prescription information.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      prescription: data,
    });
  } catch (error) {
    console.error("Prescription upload error:", error);

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
