export type Marketplace = {
  id: "amazon" | "flipkart";
  name: string;
  label: string;
  subtitle: string;
  description: string;
  url: string;
  variant: "primary" | "secondary";
};

export type Product = {
  slug: string;
  name: string;
  shortName: string;
  color: string;
  colorHex: string;
  headline: string;
  description: string;
  about: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  gsm: number;
  fabric: string;
  fit: string;
  rating: number;
  reviewCount: number;
  features: string[];
  outcomes: string[];
  specs: string[];
  styling: string[];
  images: {
    src: string;
    alt: string;
  }[];
  marketplaces: Marketplace[];
  seo: {
    title: string;
    description: string;
  };
};

const sharedOutcomes = [
  "Feels soft from the first wear.",
  "Keeps its structure after washing.",
  "Breathes throughout the day.",
  "Oversized fit that doesn't lose shape.",
  "Minimal aesthetic that matches everything.",
];

const sharedSpecs = [
  "220 GSM premium combed cotton",
  "100% combed cotton",
  "Drop shoulder construction",
  "Oversized unisex fit",
  "Skin-friendly, chemical-safe dyes",
  "Minimal design — no loud branding",
];

const sharedStyling = [
  "Black jeans for a monochrome look",
  "Cargo pants for casual streetwear",
  "Tailored shorts in warmer months",
  "Clean sneakers or loafers",
  "Layer under an open shirt or overshirt",
];

const marketplaceLinks = {
  black: {
    amazon:
      "https://www.amazon.in/dp/B0H9NJP2B2?ref=cm_sw_r_cso_cp_apan_dp_E5EZ07QCH5BSJ9Y81ZH9&th=1&psc=1",
    flipkart:
      "https://www.flipkart.com/plain-thread-solid-couple-round-neck-black-t-shirt/p/itme739e6a5f9a74?pid=TSHHPN9YGVXTZCBZ&marketplace=FLIPKART",
  },
  white: {
    amazon:
      "https://www.amazon.in/dp/B0H9NQBZ21?ref=cm_sw_r_cso_cp_apan_dp_E5EZ07QCH5BSJ9Y81ZH9&th=1&psc=1",
    flipkart:
      "https://www.flipkart.com/plain-thread-solid-couple-round-neck-white-t-shirt/p/itm9e24010bb7596?pid=TSHHPN9YHCV2PVSH&marketplace=FLIPKART",
  },
  pink: {
    amazon:
      "https://www.amazon.in/dp/B0H9NRQ6W3?ref=cm_sw_r_cso_cp_apan_dp_E5EZ07QCH5BSJ9Y81ZH9&th=1&psc=1",
    flipkart:
      "https://www.flipkart.com/plain-thread-solid-couple-round-neck-pink-t-shirt/p/itmdd731eb1c0174?pid=TSHHPN9YSXGG9GTA&marketplace=FLIPKART",
  },
} as const;

function marketplacesFor(color: keyof typeof marketplaceLinks): Marketplace[] {
  const links = marketplaceLinks[color];
  return [
    {
      id: "amazon",
      name: "Amazon",
      label: "Continue to Amazon",
      subtitle: "Official Store",
      description: "Trusted Delivery",
      url: links.amazon,
      variant: "primary",
    },
    {
      id: "flipkart",
      name: "Flipkart",
      label: "Continue to Flipkart",
      subtitle: "Official Listing",
      description: "Fast Shipping",
      url: links.flipkart,
      variant: "secondary",
    },
  ];
}

const imageCounts = {
  Black: 16,
  White: 14,
  Pink: 15,
} as const;

function productImages(folder: keyof typeof imageCounts, colorLabel: string) {
  const count = imageCounts[folder];
  const slug = colorLabel.toLowerCase();
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    const kind =
      i === 0
        ? "front view"
        : i === 1
          ? "fabric detail"
          : i % 5 === 0
            ? "back detail"
            : "lifestyle";
    return {
      src: `/images/products/${folder}/plain-thread-${slug}-oversized-tshirt-${n}.jpg`,
      alt: `${colorLabel} oversized tshirt made with 220 GSM combed cotton — ${kind}`,
    };
  });
}

export const products: Product[] = [
  {
    slug: "black-oversized-tshirt",
    name: "Black Oversized T-Shirt",
    shortName: "Black",
    color: "Black",
    colorHex: "#111111",
    headline: "Minimal Oversized T-Shirt",
    description:
      "Discover Plain Thread's premium black oversized t-shirt made with 220 GSM combed cotton. Soft, breathable, minimal, and built for everyday comfort.",
    about: `The Black Oversized T-Shirt from Plain Thread is designed for people who want fewer, better pieces. Cut in a relaxed oversized silhouette with a drop shoulder, it drapes cleanly without looking sloppy.

We use 220 GSM combed cotton — denser than typical fashion tees — so the fabric feels substantial from day one and holds its structure wash after wash. Combed fibres remove short strands that cause pilling and roughness, leaving a smoother hand-feel against the skin.

There is no loud branding, no unnecessary graphics, and no seasonal gimmicks. Just a timeless black essential you can wear with black jeans, cargos, shorts, or layered under an open shirt. Made for everyday comfort. Built to last.`,
    price: 699,
    compareAtPrice: 825,
    sku: "PT-OTS-001-JB",
    gsm: 220,
    fabric: "100% Combed Cotton",
    fit: "Oversized Unisex",
    rating: 4.9,
    reviewCount: 128,
    features: [
      "220 GSM",
      "Oversized Fit",
      "Breathable",
      "Skin Friendly",
      "Minimal Design",
      "Unisex",
    ],
    outcomes: sharedOutcomes,
    specs: sharedSpecs,
    styling: sharedStyling,
    images: productImages("Black", "Black"),
    marketplaces: marketplacesFor("black"),
    seo: {
      title: "Black Oversized T-Shirt | 220 GSM Combed Cotton | Plain Thread",
      description:
        "Discover Plain Thread's premium black oversized t-shirt made with 220 GSM combed cotton. Soft, breathable, minimal, and built for everyday comfort.",
    },
  },
  {
    slug: "white-oversized-tshirt",
    name: "White Oversized T-Shirt",
    shortName: "White",
    color: "White",
    colorHex: "#f5f5f5",
    headline: "Minimal Oversized T-Shirt",
    description:
      "Discover Plain Thread's premium white oversized t-shirt made with 220 GSM combed cotton. Clean, breathable, and built for everyday comfort.",
    about: `The White Oversized T-Shirt is the quiet foundation of a capsule wardrobe. Bright without looking harsh, soft without feeling thin — it is crafted from the same 220 GSM combed cotton as every Plain Thread essential.

An oversized cut with drop shoulders gives room to move while keeping a refined outline. The denser GSM helps the white stay structured instead of going sheer or limp after a few washes.

Style it with dark denim, neutrals, or layered under a jacket. No graphics. No noise. Just a white tee that earns its place in your rotation.`,
    price: 699,
    compareAtPrice: 825,
    sku: "PT-OTS-001-SW",
    gsm: 220,
    fabric: "100% Combed Cotton",
    fit: "Oversized Unisex",
    rating: 4.8,
    reviewCount: 96,
    features: [
      "220 GSM",
      "Oversized Fit",
      "Breathable",
      "Skin Friendly",
      "Minimal Design",
      "Unisex",
    ],
    outcomes: sharedOutcomes,
    specs: sharedSpecs,
    styling: sharedStyling,
    images: productImages("White", "White"),
    marketplaces: marketplacesFor("white"),
    seo: {
      title: "White Oversized T-Shirt | Plain Thread",
      description:
        "Premium white oversized t-shirt by Plain Thread. 220 GSM combed cotton, minimal design, breathable comfort. Shop on plainthread.in.",
    },
  },
  {
    slug: "pink-oversized-tshirt",
    name: "Pink Oversized T-Shirt",
    shortName: "Pink",
    color: "Pink",
    colorHex: "#e8b4b8",
    headline: "Minimal Oversized T-Shirt",
    description:
      "Discover Plain Thread's premium pink oversized t-shirt made with 220 GSM combed cotton. Soft rose tone, breathable comfort, timeless minimal design.",
    about: `The Pink Oversized T-Shirt brings a soft rose tone to the Plain Thread essentials line — still minimal, still quiet, still built to last.

Same 220 GSM combed cotton. Same oversized unisex fit. Same skin-friendly construction. The colour is intentional: muted enough for everyday wear, distinctive enough to stand out without relying on graphics.

Pair it with black trousers, neutrals, or denim. It is the piece customers describe as “perfect” — because it feels considered, not loud.`,
    price: 699,
    compareAtPrice: 825,
    sku: "PT-OTS-001-RP",
    gsm: 220,
    fabric: "100% Combed Cotton",
    fit: "Oversized Unisex",
    rating: 4.9,
    reviewCount: 84,
    features: [
      "220 GSM",
      "Oversized Fit",
      "Breathable",
      "Skin Friendly",
      "Minimal Design",
      "Unisex",
    ],
    outcomes: sharedOutcomes,
    specs: sharedSpecs,
    styling: sharedStyling,
    images: productImages("Pink", "Pink"),
    marketplaces: marketplacesFor("pink"),
    seo: {
      title: "Pink Oversized T-Shirt | Plain Thread",
      description:
        "Premium pink oversized t-shirt by Plain Thread. 220 GSM combed cotton, soft rose tone, minimal design. Shop on plainthread.in.",
    },
  },
];

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

export function getRelatedProducts(slug: string) {
  return products.filter((p) => p.slug !== slug);
}
