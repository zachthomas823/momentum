import { type ReactNode } from "react";

interface PillProps {
  children: ReactNode;
  color?: string;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Pill({
  children,
  color = "var(--amber)",
  active = false,
  className = "",
  onClick,
}: PillProps) {
  const Component = onClick ? "button" : "span";
  return (
    <Component
      onClick={onClick}
      className={`
        inline-flex items-center justify-center
        rounded-[40px] px-3 py-1
        text-[11px] font-bold uppercase tracking-[0.12em]
        min-h-[32px]
        transition-all duration-200
        ${onClick ? "cursor-pointer min-h-[44px] px-4" : ""}
        ${className}
      `}
      style={{
        border: `1px solid ${color}`,
        background: active ? color : "transparent",
        color: active ? "#0d1117" : color,
      }}
    >
      {children}
    </Component>
  );
}
