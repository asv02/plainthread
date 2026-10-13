# Plain Thread

SEO-first micro brand website for premium oversized essentials. Sends shoppers to Amazon and Flipkart with a psychology-led journey: Attention → Trust → Desire → Choice → Action.

## Stack

- Next.js App Router
- Tailwind CSS
- Framer Motion
- Lucide React
- MDX blog content
- JSON-LD structured data

## Architecture

```
/
/shop
/products
/products/black-oversized-tshirt
/products/white-oversized-tshirt
/products/pink-oversized-tshirt
/collections/oversized-tshirts
/why-plain-thread
/fabric
/size-guide
/care-guide
/about
/faq
/contact
/blog/*
/privacy
```

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## SEO included

- `generateMetadata` + canonical URLs
- `sitemap.xml` + `robots.txt`
- Product, FAQ, Organization, Website, Breadcrumb, Article schema
- Keyword-rich product and blog URLs
- Internal linking across products, guides, and articles

## Customize marketplace links

Update marketplace URLs in `src/data/products.ts` with your official Amazon and Flipkart listing links.

Brand content referenced from [asv02/Plain-Theory](https://github.com/asv02/Plain-Theory).

## Homepage hero discount treatment

The homepage hero in `src/app/page.tsx` keeps its existing brand name, headline, product-quality copy, and CTA links, and adds a separate responsive “FLAT 15% OFF — ON ALL T-SHIRTS” seal on the right.

### Design decisions

- Uses live HTML text for the promotion instead of baking words into an image, so the offer stays crisp at all sizes and can be adjusted without re-exporting artwork.
- Uses a warm ivory gradient and a decorative, low-opacity inline SVG botanical branch to echo the supplied reference without adding another image dependency or affecting page performance.
- Keeps the existing collection and brand-story links unchanged.
- Uses a responsive grid: the badge moves below the copy on small screens and sits to the right on desktop, avoiding overlap with the existing headline and buttons.
- The botanical SVG is decorative and hidden from assistive technology; the discount seal has an accessible label.

### Alternatives considered

- **Use the supplied full hero image as a background:** closest pixel-level match, but it would bake the copy and badge into an image, make the text less flexible, and risk duplicating the existing HTML content.
- **Use a separate botanical photo asset:** potentially more photorealistic, but adds asset management and optimization work. The inline SVG is lightweight and scales cleanly.
- **Use a small promotional pill:** simpler, but it does not match the requested circular editorial badge.

### Verification

After pulling the branch, run:

```bash
npm install
npm run lint
npm run build
```

Also review the homepage at mobile and desktop widths. Confirm the offer does not overlap the existing copy or buttons and that the two original CTA links still navigate to `/collections/oversized-tshirts` and `/why-plain-thread`.

