"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaFiles } from "@/app/admin/media/actions";

export type MediaOption = {
  id: string;
  storage_path: string;
  filename: string;
  alt?: string | null;
  created_at?: string | null;
};

type SingleProps = {
  name: string;
  options: MediaOption[];
  initial?: string | null;
  label?: string;
  multiple?: false;
};

type MultiProps = {
  name: string;
  options: MediaOption[];
  initial?: string[] | null;
  label?: string;
  multiple: true;
};

type Props = SingleProps | MultiProps;

const TILE_SIZE = 112;

export function MediaPicker(props: Props) {
  const isMulti = props.multiple === true;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const router = useRouter();
  const [pendingUpload, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [single, setSingle] = useState<string>(
    !isMulti && typeof props.initial === "string" ? props.initial : "",
  );
  const [multi, setMulti] = useState<string[]>(
    isMulti && Array.isArray(props.initial) ? props.initial : [],
  );
  const [filter, setFilter] = useState("");
  const [showCount, setShowCount] = useState(80);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  // Newly-uploaded media that's not yet in props.options (until router.refresh
  // re-fetches the parent server component). We splice them in locally so the
  // tile appears immediately.
  const [extras, setExtras] = useState<MediaOption[]>([]);

  const sorted = useMemo(() => {
    const combined = [...extras, ...props.options];
    // Dedupe by id (extras shadow props.options once refresh lands).
    const seen = new Set<string>();
    const out: MediaOption[] = [];
    for (const o of combined) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
    return out.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : Number.MAX_SAFE_INTEGER;
      const tb = b.created_at ? Date.parse(b.created_at) : Number.MAX_SAFE_INTEGER;
      return tb - ta;
    });
  }, [extras, props.options]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return sorted;
    return sorted.filter((o) => {
      const hay = `${o.filename} ${o.alt ?? ""} ${o.storage_path}`.toLowerCase();
      return f.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [filter, sorted]);

  const visible = filtered.slice(0, showCount);

  function isSelected(id: string): boolean {
    return isMulti ? multi.includes(id) : single === id;
  }

  function toggle(id: string) {
    if (isMulti) {
      setMulti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    } else {
      setSingle((cur) => (cur === id ? "" : id));
    }
  }

  function clearSelection() {
    if (isMulti) setMulti([]);
    else setSingle("");
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadInfo(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    startUpload(async () => {
      const result = await uploadMediaFiles(fd);
      if (!result.ok) { setUploadError(result.error); return; }

      // Optimistically add stubs for the new media so they appear in the
      // grid before the router refresh lands. We don't have storage_path
      // back, but we can show a placeholder by reading the freshly-inserted
      // row from the parent on refresh. For now use a created_at=now stub
      // and let the refresh replace it.
      const now = new Date().toISOString();
      setExtras((prev) => [
        ...result.ids.map<MediaOption>((id) => ({
          id, storage_path: "", filename: "E ngarkuar", alt: null, created_at: now,
        })),
        ...prev,
      ]);

      // Auto-select uploaded items for the picker
      if (isMulti) setMulti((prev) => [...prev, ...result.ids]);
      else if (result.ids.length === 1) setSingle(result.ids[0]);

      setUploadInfo(
        `${result.ids.length} ${result.ids.length === 1 ? "foto u ngarkua" : "foto u ngarkuan"}` +
        (result.skipped ? ` · ${result.skipped} u kapërcyen` : ""),
      );
      // Pull fresh options from the parent (with real storage_path).
      router.refresh();
      // Reset file input so the same file can be re-picked if needed.
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  const selectedCount = isMulti ? multi.length : single ? 1 : 0;
  const label = props.label ?? (isMulti ? "Galeria" : "Imazhi");
  const hiddenValue = isMulti ? multi.join(",") : single;

  return (
    <div className="field">
      <label>
        {label}
        {isMulti && <span style={{ marginLeft: 8, color: "var(--ember)", fontSize: 11 }}>({selectedCount})</span>}
      </label>
      <input type="hidden" name={props.name} value={hiddenValue} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Kërko sipas emrit, tekstit alt ose datës (p.sh. 2025)…"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setShowCount(80); }}
          style={{ flex: "1 1 240px", minWidth: 240 }}
        />
        <button
          type="button"
          className="btn btn-ember btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={pendingUpload}
        >
          {pendingUpload ? "Duke ngarkuar…" : "+ Ngarko foto"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple={isMulti}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {selectedCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearSelection}
            title="Hiq të gjitha"
          >
            Hiq {isMulti ? `(${selectedCount})` : ""}
          </button>
        )}
      </div>

      {uploadError && <div style={{ color: "var(--err)", fontSize: 12, marginBottom: 8 }}>Gabim: {uploadError}</div>}
      {uploadInfo && <div style={{ color: "var(--ok)", fontSize: 12, marginBottom: 8 }}>{uploadInfo}</div>}

      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em", marginBottom: 8 }}>
        {filter
          ? `${visible.length}/${filtered.length} rezultate · më të rejat së pari`
          : `${visible.length}/${sorted.length} media · radhitur sipas datës, më të rejat së pari`}
      </div>

      {/* Critical: grid-auto-rows pinned to TILE_SIZE so rows can't stretch.
          Buttons are also explicitly width:100% height:TILE_SIZE so the
          browser doesn't get confused by aspect-ratio + auto rows. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_SIZE}px, 1fr))`,
          gridAutoRows: `${TILE_SIZE}px`,
          gap: 10,
          maxHeight: 480,
          overflowY: "auto",
          padding: 10,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 8,
        }}
      >
        {visible.map((o) => {
          const selected = isSelected(o.id);
          const src = o.storage_path ? `${supaUrl}/storage/v1/object/public/media/${o.storage_path}` : "";
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              title={o.alt || o.filename}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                padding: 0,
                background: "var(--paper-2)",
                border: selected ? "3px solid var(--ember)" : "1px solid var(--line)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: "pointer",
                display: "block",
              }}
            >
              {src && (
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              )}
              {!src && (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: ".12em" }}>
                  Duke u ngarkuar…
                </span>
              )}
              {selected && (
                <span
                  style={{
                    position: "absolute",
                    top: 6, right: 6,
                    width: 22, height: 22,
                    background: "var(--ember)",
                    color: "var(--paper)",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,.25)",
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length > visible.length && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          onClick={() => setShowCount((c) => c + 80)}
        >
          Shfaq {Math.min(80, filtered.length - visible.length)} të tjera ({filtered.length - visible.length} mbeten)
        </button>
      )}

      <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
        Kliko foton për ta {isMulti ? "shtuar ose hequr nga galeria" : "zgjedhur"} · ngarko foto të reja me butonin më lart.
      </p>
    </div>
  );
}
