import { adminApi } from "@/lib/api";

export interface UploadedFile {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

/** 10MB. Large enough for a scanned form, small enough to arrive. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Upload straight from the browser to Cloudinary with a signature minted by
 * the API, and hand back what a message needs to render the file: a name, a
 * type to decide image-or-document by, and a size. The bytes never touch the
 * API, so a failed upload costs a round trip rather than a half-written row.
 */
export async function uploadAccountOfficerFile(file: File): Promise<UploadedFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than 10MB.`);
  }

  const { data: signed } = await adminApi.accountOfficerUploadSignature();

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  // Must match the signed parameters exactly or Cloudinary rejects it.
  form.append("folder", signed.folder);
  form.append("public_id", signed.publicId);

  const res = await fetch(signed.uploadUrl, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.secure_url) {
    throw new Error(json?.error?.message ?? `Could not upload ${file.name}`);
  }

  return {
    fileName: file.name,
    fileUrl: json.secure_url as string,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}
