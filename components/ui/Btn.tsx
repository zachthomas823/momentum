"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  color?: string;
  full?: boolean;
}

export function Btn({
  children,
  color = "var(--amber)",
  full = false,
  disabled,
  className = "",
  style,
  ...props
}: BtnProps) {
  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center justify-center
        rounded-[40px] px-5 font-semibold text-sm
        min-h-[44px]
        transition-all duration-200
        ${full ? "w-full" : ""}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"}
        ${className}
      `}
      style={{
        background: color,
        color: "#0d1117",
        boxShadow: disabled ? "none" : `0 0 20px ${color}33`,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
