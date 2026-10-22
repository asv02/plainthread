/**
 * Draws a rating as a proportional fill. The previous markup repeated "★" five
 * times for every product, so a 4.9 rating rendered as a perfect score. The
 * unfilled row is real content underneath a clipped overlay, and the numeric
 * value stays visible so the graphic is never the only carrier of the score.
 */
export function StarRating({
  rating,
  reviewCount,
  className = "",
}: {
  rating: number;
  reviewCount?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  // Rounded to a tenth of a percent; rating/5*100 is not exact in floating point.
  const widthPercent = Math.round((clamped / 5) * 1000) / 10;
  const label =
    reviewCount == null
      ? `${clamped} out of 5 stars`
      : `${clamped} out of 5 stars from ${reviewCount} reviews`;

  return (
    <span
      className={`inline-flex items-baseline gap-2 text-sm ${className}`}
      role="img"
      aria-label={label}
    >
      <span
        aria-hidden="true"
        className="relative tracking-widest text-[#d9d9d9]"
      >
        ★★★★★
        <span
          className="absolute left-0 top-0 h-full overflow-hidden whitespace-nowrap text-foreground"
          style={{ width: `${widthPercent}%` }}
        >
          ★★★★★
        </span>
      </span>
      <span aria-hidden="true" className="tracking-normal text-secondary">
        {clamped}
        {reviewCount != null ? ` · ${reviewCount} reviews` : ""}
      </span>
    </span>
  );
}
