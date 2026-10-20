import { siteConfig } from "@/data/site";
import type { Product } from "@/data/products";
import type { FaqItem } from "@/data/faqs";
import { absoluteUrl } from "@/lib/seo";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.domain,
    logo: absoluteUrl("/logo.svg"),
    sameAs: [siteConfig.instagram],
    email: siteConfig.email,
    foundingDate: String(siteConfig.foundingYear),
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.domain,
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type ProductSchemaCommerce = {
  pricePaise?: number;
  inStock?: boolean;
};

export function productSchema(product: Product, commerce: ProductSchemaCommerce = {}) {
  const priceRupees = commerce.pricePaise != null ? commerce.pricePaise / 100 : product.price;
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url: absoluteUrl(`/products/${product.slug}`),
    priceCurrency: siteConfig.currency,
    price: priceRupees,
    seller: {
      "@type": "Organization",
      name: siteConfig.name,
    },
  };
  // Only claim availability when real variant stock was read; otherwise omit rather than assume InStock.
  if (commerce.inStock !== undefined) {
    offer.availability = commerce.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";
  }
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    image: product.images.map((img) => absoluteUrl(img.src)),
    brand: {
      "@type": "Brand",
      name: siteConfig.name,
    },
    material: product.fabric,
    color: product.color,
    offers: offer,
  };
}

export function faqSchema(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function articleSchema(input: {
  title: string;
  description: string;
  path: string;
  date: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    datePublished: input.date,
    dateModified: input.date,
    author: {
      "@type": "Organization",
      name: siteConfig.name,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/logo.svg"),
      },
    },
    mainEntityOfPage: absoluteUrl(input.path),
  };
}
