import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500",
  secondary: "border border-zinc-700 text-zinc-300 hover:border-zinc-500",
  ghost: "text-zinc-400 hover:text-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
