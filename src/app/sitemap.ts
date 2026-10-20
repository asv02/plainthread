import type { MetadataRoute } from "next";
import { products } from "@/data/products";
import { getAllPosts } from "@/lib/blog";
import { siteConfig } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/shop",
    "/products",
    "/collections/oversized-tshirts",
    "/why-plain-thread",
    "/fabric",
    "/size-guide",
    "/care-guide",
    "/shipping-returns",
    "/about",
    "/faq",
    "/contact",
    "/blog",
    "/privacy",
  ];

  return [
    ...staticRoutes.map((path) => ({
      url: `${siteConfig.domain}${path}`,
      changeFrequency: path === "" || path === "/shop" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path.startsWith("/product") || path === "/shop" ? 0.9 : 0.7,
    })),
    ...products.map((product) => ({
      url: `${siteConfig.domain}/products/${product.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.95,
    })),
    ...getAllPosts().map((post) => ({
      url: `${siteConfig.domain}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
  ];
}
