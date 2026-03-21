import { type ReactNode } from "react";

interface LabelProps {
  children: ReactNode;
  className?: string;
}

export function Label({ children, className = "" }: LabelProps) {
  return (
    <span
      className={`text-[11px] font-extrabold uppercase tracking-[0.12em] text-t2 ${className}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {children}
    </span>
  );
}
