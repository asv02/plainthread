import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FadeIn } from "@/components/ui/FadeIn";
import { JsonLd } from "@/components/seo/JsonLd";
import { products } from "@/data/products";
import { getAllPosts, getBlogSlugs, getPostBySlug } from "@/lib/blog";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return buildMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: "article",
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const related = getAllPosts()
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      post: p,
      score:
        (p.category === post.category ? 2 : 0) +
        p.tags.filter((tag) => post.tags.includes(tag)).length,
    }))
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1))
    .slice(0, 3)
    .map((entry) => entry.post);

  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.description,
            path: `/blog/${post.slug}`,
            date: post.date,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />

      <article className="container-px py-10 md:py-16">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Blog", href: "/blog" },
            { name: post.title },
          ]}
        />

        <FadeIn>
          <p className="text-xs uppercase tracking-[0.18em] text-secondary">
            {post.category} · {post.readingTime}
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-secondary">{post.description}</p>
        </FadeIn>

        <div className="prose-pt mt-12 max-w-3xl">
          <MDXRemote source={post.content} />
        </div>

        <section className="mt-16 border-t border-border pt-12">
          <h2 className="font-serif text-3xl">Shop the essentials</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {products.map((product) => (
              <li key={product.slug}>
                <Link
                  href={`/products/${product.slug}`}
                  className="block border border-border px-4 py-4 text-sm transition hover:shadow-[var(--shadow)]"
                >
                  {product.name} →
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/collections/oversized-tshirts"
            className="mt-4 inline-block text-sm underline underline-offset-4"
          >
            View full collection
          </Link>
        </section>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-serif text-3xl">Keep reading</h2>
            <ul className="mt-6 space-y-4">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/blog/${item.slug}`}
                    className="font-serif text-xl hover:underline hover:underline-offset-4"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
