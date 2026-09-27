import { useState } from "react";
import { categoryVisual } from "./categoryVisual";
import { cn } from "../../lib/utils";

type EventImageProps = {
  src?: string;
  alt: string;
  categorySlug: string;
  className?: string;
  imageClassName?: string;
  loading?: "lazy" | "eager";
  sizes?: string;
};

export function EventImage({
  src,
  alt,
  categorySlug,
  className,
  imageClassName,
  loading = "lazy",
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: EventImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const { icon: Icon, gradient } = categoryVisual(categorySlug);
  const imageSource = src && failedSource !== src ? src : undefined;

  return (
    <div
      className={cn("relative aspect-[16/9] w-full overflow-hidden bg-paper dark:bg-surface-dark", className)}
      role={imageSource ? undefined : "img"}
      aria-label={imageSource ? undefined : alt}
    >
      {imageSource ? (
        <img
          src={imageSource}
          alt={alt}
          loading={loading}
          decoding="async"
          sizes={sizes}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setFailedSource(imageSource)}
        />
      ) : (
        <div className={cn("absolute inset-0 flex items-center justify-center bg-gradient-to-br", gradient)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.25),transparent_60%)]" />
          <Icon className="relative h-10 w-10 text-white drop-shadow-sm" />
          <span className="sr-only">{alt}</span>
        </div>
      )}
    </div>
  );
}
