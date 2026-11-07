import { useState, type ImgHTMLAttributes } from "react";
import { ArchiveIcon } from "@radix-ui/react-icons";
import { foodPhotoPresentation, foodPhotoTone, type FoodPhotoFailure } from "./foodPhotoPresentation";
import "./foodPhoto.css";

type FoodPhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "onLoad"> & {
  src: string;
  foodName: string;
  /** Optional hints for the placeholder tint; the food name is used when they are missing. */
  category?: string | null;
  storage?: string | null;
};

/**
 * Every food photo in the app. Until the photo paints, the box shows a muted tint for the food's
 * kind plus the archive icon (foodPhoto.css), so a slow photo never reads as an empty grey box;
 * a photo that cannot load stays on that same placeholder.
 */
export function FoodPhoto({ src, foodName, category, storage, loading = "lazy", style, ...props }: FoodPhotoProps) {
  const [failure, setFailure] = useState<FoodPhotoFailure>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const presentation = foodPhotoPresentation(src, foodName, failure);
  const tone = foodPhotoTone({ category, storage, foodName });
  if (presentation.kind === "placeholder") {
    return <span className={`food-photo-placeholder ${props.className ?? ""}`.trim()} style={style} data-photo-tone={tone}
      aria-hidden={props.alt ? undefined : true} role={props.alt ? "img" : undefined} aria-label={props.alt || undefined}>
      <ArchiveIcon width={24} height={24} />
    </span>;
  }
  const loaded = loadedSource === presentation.source;
  return <img {...props} src={presentation.source} loading={loading} decoding="async"
    style={style}
    data-photo-tone={tone}
    data-photo-state={loaded ? "loaded" : "loading"}
    // A cached photo can finish before React attaches onLoad; the ref catches that case.
    ref={(element) => { if (element?.complete && element.naturalWidth > 0 && !loaded) setLoadedSource(presentation.source); }}
    onLoad={() => setLoadedSource(presentation.source)}
    onError={() => setFailure({ source: src, fallbackFailed: presentation.source === presentation.fallback, fallback: presentation.fallback })} />;
}
