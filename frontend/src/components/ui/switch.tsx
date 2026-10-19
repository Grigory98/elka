import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Тумблер включения.
 *
 * Цвета берутся из переменных темы (`--input`, `--primary`, `--border`, `--background`), а не заданы
 * здесь, поэтому он одинаково читается в тёмной и светлой палитрах и следует за темой, если её
 * переключили в другой цвет.
 */
function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border p-0.5 transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-transparent bg-primary" : "border-border bg-input",
        className
      )}
      {...props}
    >
      {/* Ползунок едет по дорожке, а не меняет её: смена цвета и сдвиг идут одним переходом. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}

export { Switch }