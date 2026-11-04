import { useState, type ImgHTMLAttributes } from "react";
import { ArchiveIcon } from "@radix-ui/react-icons";
import { foodPhotoPresentation, type FoodPhotoFailure } from "./foodPhotoPresentation";
import "./foodPhoto.css";

type FoodPhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  foodName: string;
};

export function FoodPhoto({ src, foodName, loading = "lazy", style, ...props }: FoodPhotoProps) {
  const [failure, setFailure] = useState<FoodPhotoFailure>(null);
  const presentation = foodPhotoPresentation(src, foodName, failure);
  if (presentation.kind === "placeholder") {
    return <span className={`food-photo-placeholder ${props.className ?? ""}`.trim()} style={style}
      aria-hidden={props.alt ? undefined : true} role={props.alt ? "img" : undefined} aria-label={props.alt || undefined}>
      <ArchiveIcon width={24} height={24} />
    </span>;
  }
  return <img {...props} src={presentation.source} loading={loading} decoding="async"
    style={style}
    onError={() => setFailure({ source: src, fallbackFailed: presentation.source === presentation.fallback, fallback: presentation.fallback })} />;
}
