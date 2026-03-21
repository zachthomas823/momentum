import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`relative rounded-2xl border border-white/[0.06] bg-card overflow-hidden ${className}`}
    >
      <div className="glass-gradient absolute inset-0 pointer-events-none" />
      <div className="relative p-4">{children}</div>
    </div>
  );
}
