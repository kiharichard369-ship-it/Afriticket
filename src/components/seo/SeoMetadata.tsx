import { useEffect } from "react";

type SeoMetadataProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  imageUrl?: string;
  type?: "website" | "article";
  noIndex?: boolean;
};

const SITE_NAME = "Ticketyangu";
const DEFAULT_IMAGE_ALT = "Ticketyangu events across Kenya";

function absoluteUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return undefined;
  }
}

function setMeta(attribute: "name" | "property", key: string, content?: string) {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);

  if (!content) {
    existing?.remove();
    return;
  }

  const meta = existing ?? document.head.appendChild(document.createElement("meta"));
  meta.setAttribute(attribute, key);
  meta.setAttribute("content", content);
}

function setCanonical(url?: string) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!url) {
    existing?.remove();
    return;
  }

  const link = existing ?? document.head.appendChild(document.createElement("link"));
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", url);
}

export function SeoMetadata({
  title,
  description,
  canonicalPath,
  imageUrl,
  type = "website",
  noIndex = false,
}: SeoMetadataProps) {
  useEffect(() => {
    const canonicalUrl = absoluteUrl(canonicalPath);
    const socialImageUrl = absoluteUrl(imageUrl);

    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "robots", noIndex ? "noindex,nofollow" : "index,follow");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", socialImageUrl);
    setMeta("property", "og:image:alt", imageUrl ? DEFAULT_IMAGE_ALT : undefined);
    setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", socialImageUrl);
    setCanonical(canonicalUrl);
  }, [canonicalPath, description, imageUrl, noIndex, title, type]);

  return null;
}
