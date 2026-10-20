import type { CSSProperties, ReactNode } from "react";

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const style: CSSProperties | undefined = delay > 0 ? { animationDelay: `${delay}s` } : undefined;
  return (
    <div className={`fade-in-up ${className ?? ""}`} style={style}>
      {children}
    </div>
  );
}
