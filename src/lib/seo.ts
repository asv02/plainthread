import type { Metadata } from "next";
import { siteConfig } from "@/data/site";

type BuildMetadataInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: "website" | "article";
  noIndex?: boolean;
};

export function absoluteUrl(path = "") {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.domain}${clean === "/" ? "" : clean}`;
}

export function buildMetadata({
  title,
  description,
  path = "/",
  image = "/og-default.png",
  imageWidth,
  imageHeight,
  type = "website",
  noIndex = false,
}: BuildMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const fullTitle = title.includes("Plain Thread")
    ? title
    : `${title} | Plain Thread`;

  const preview = { url: absoluteUrl(image), alt: fullTitle };
  const sizedPreview =
    imageWidth && imageHeight ? { ...preview, width: imageWidth, height: imageHeight } : preview;

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type,
      images: [sizedPreview],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [absoluteUrl(image)],
    },
  };
}
