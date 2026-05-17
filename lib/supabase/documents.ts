// Server-side data access for the public /documents page + the admin
// /admin/documents CRUD. Single source of truth for the category labels
// (used by both pages so they don't drift apart).

import { createClient } from "./server";
import { mediaUrl } from "./fb";

export type DocumentCategory =
  | "regulations" | "decisions" | "minutes" | "declarations" | "certificates" | "other";

export type DocumentVisibility = "public" | "members" | "admin";

export type DocumentRow = {
  id: string;
  slug: string;
  title: string;
  category: DocumentCategory;
  storage_path: string;
  filename: string;
  mime_type: string;
  byte_size: number | null;
  page_count: number | null;
  description: string | null;
  effective_date: string | null;
  display_order: number;
  visibility: DocumentVisibility;
  created_at: string;
  updated_at: string;
};

export const CATEGORY_ORDER: DocumentCategory[] = [
  "regulations",
  "decisions",
  "minutes",
  "declarations",
  "certificates",
  "other",
];

const CATEGORY_LABELS_SQ: Record<DocumentCategory, string> = {
  regulations: "Rregulloret",
  decisions: "Vendimet",
  minutes: "Procesverbalet",
  declarations: "Deklaratat",
  certificates: "Vërtetimet",
  other: "Dokumente të tjera",
};

const CATEGORY_LABELS_EN: Record<DocumentCategory, string> = {
  regulations: "Regulations",
  decisions: "Decisions",
  minutes: "Minutes",
  declarations: "Declarations",
  certificates: "Certificates",
  other: "Other documents",
};

export function categoryLabel(c: DocumentCategory, locale: "sq" | "en" = "sq"): string {
  return (locale === "en" ? CATEGORY_LABELS_EN : CATEGORY_LABELS_SQ)[c];
}

export function documentUrl(d: { storage_path: string }): string {
  return mediaUrl(d.storage_path) ?? "#";
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function getDocuments(category?: DocumentCategory): Promise<DocumentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("documents")
    .select("*")
    .order("category")
    .order("display_order")
    .order("title");
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return (data as unknown as DocumentRow[] | null) ?? [];
}

export async function getDocumentsGrouped(): Promise<Map<DocumentCategory, DocumentRow[]>> {
  const all = await getDocuments();
  const grouped = new Map<DocumentCategory, DocumentRow[]>();
  for (const c of CATEGORY_ORDER) grouped.set(c, []);
  for (const d of all) grouped.get(d.category)!.push(d);
  return grouped;
}
