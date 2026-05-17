"use client";

import Image from "next/image";
import { useState } from "react";
import { Lightbox, type LightboxPhoto } from "./Lightbox";

export type GalleryPhoto = {
  src: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
};

type Props = {
  photos: GalleryPhoto[];
  /** Optional className on the wrapper. Defaults to "gallery" (uses the
   *  asymmetric mosaic from globals.css for up to 6 photos). */
  className?: string;
  /** When true, force a uniform responsive grid instead of the mosaic.
   *  Use for strips and when count > 6. */
  uniform?: boolean;
};

// Thumb grid that opens a full-screen Lightbox on click. Server-rendered
// initially; only the open/close state lives on the client.
export function PhotoGallery({ photos, className, uniform = false }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  // The hand-rolled CSS in globals.css supports an asymmetric mosaic
  // for exactly up to 6 cells. Anything past 6 looks awkward, so fall
  // back to a uniform 4-column grid in that case.
  const useMosaic = !uniform && photos.length <= 6;

  const lightboxPhotos: LightboxPhoto[] = photos.map((p) => ({
    src: p.src,
    width: p.width ?? undefined,
    height: p.height ?? undefined,
    alt: p.alt ?? undefined,
  }));

  return (
    <>
      <div
        className={className ?? (useMosaic ? "gallery" : "")}
        style={
          useMosaic
            ? undefined
            : {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }
        }
      >
        {photos.map((p, i) => {
          const w = p.width ?? 1080;
          const h = p.height ?? Math.round(w * 0.75);
          return (
            <button
              key={p.src + i}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={p.alt || `Photo ${i + 1}`}
              className={useMosaic ? `ph g${i + 1}` : "gallery-tile"}
              style={{
                position: "relative",
                overflow: "hidden",
                padding: 0,
                margin: 0,
                background: "var(--paper-2)",
                border: "none",
                cursor: "zoom-in",
                borderRadius: useMosaic ? 8 : 6,
                aspectRatio: useMosaic ? undefined : "4 / 3",
                transition: "transform .25s cubic-bezier(.2,.7,.2,1)",
              }}
            >
              <Image
                src={p.src}
                alt={p.alt || ""}
                fill
                sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw"
                style={{
                  objectFit: "cover",
                  transition: "transform .4s cubic-bezier(.2,.7,.2,1)",
                }}
                // Provide hint for layout-shift prevention even with fill.
                quality={75}
                placeholder="empty"
                {...(w && h ? { unoptimized: false } : {})}
              />
            </button>
          );
        })}
      </div>

      <style>{`
        .gallery-tile:hover, .gallery .ph:hover {
          outline: 2px solid var(--ember);
          outline-offset: 2px;
        }
        .gallery-tile:hover img, .gallery .ph:hover img {
          transform: scale(1.04);
        }
        .gallery .ph { cursor: zoom-in; position: relative; overflow: hidden; }
      `}</style>

      <Lightbox
        photos={lightboxPhotos}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
