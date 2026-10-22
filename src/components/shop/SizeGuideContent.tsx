import { sizeGuide } from "@/data/content";
import { sizeTableHeaders, sizeTableRows } from "@/lib/shop/sizing";

/**
 * One rendering of the published sizing data, used by both /size-guide and the
 * in-page dialog so the two can never disagree. Below the small breakpoint the
 * table becomes stacked per-size cards, because six columns only fit on a phone
 * by scrolling sideways or shrinking the text.
 */
export function SizeGuideContent() {
  const rows = sizeTableRows();
  const measureHeaders = sizeTableHeaders.slice(1);
  return (
    <div className="space-y-6">
      <p className="text-sm leading-7 text-secondary">{sizeGuide.note}</p>
      <p className="text-sm leading-7 text-secondary">
        <span className="font-medium text-foreground">Chest (flat)</span> is measured straight
        across the tee lying on a table.{" "}
        <span className="font-medium text-foreground">Chest (around)</span> is that same number
        doubled — the circumference the shirt actually encloses.
      </p>

      <div className="hidden overflow-x-auto border border-border sm:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">
            Plain Thread oversized tee garment measurements in centimetres
          </caption>
          <thead className="border-b border-border bg-muted">
            <tr>
              {sizeTableHeaders.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap px-3 py-3 font-medium tracking-wide sm:px-4"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-border last:border-0">
                {row.map((cell, i) => (
                  <td
                    key={`${row[0]}-${i}`}
                    className={`whitespace-nowrap px-3 py-3 sm:px-4 ${
                      i === 0 ? "font-serif text-base text-foreground" : "text-secondary"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <li key={row[0]} className="border border-border p-4">
            <p className="font-serif text-lg text-foreground">{row[0]}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {measureHeaders.map((header, i) => (
                <div key={header} className="contents">
                  <dt className="text-secondary">{header}</dt>
                  <dd className="text-right text-foreground">{row[i + 1]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="font-serif text-xl sm:text-2xl">How to measure</h2>
        <ol className="mt-4 space-y-3">
          {sizeGuide.howToMeasure.map((step, index) => (
            <li key={step.title} className="flex gap-4 border border-border px-4 py-3">
              <span className="font-serif text-lg text-secondary sm:text-xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-secondary">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-serif text-xl sm:text-2xl">Fit advice</h2>
        <p className="mt-2 text-sm text-secondary">
          Guidance on the intended oversized silhouette — not a guarantee of fit.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {sizeGuide.fitAdvice.map((tip) => (
            <div key={tip.title} className="border border-border p-4">
              <h3 className="text-sm font-medium text-foreground">{tip.title}</h3>
              <p className="mt-2 text-sm leading-6 text-secondary">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
