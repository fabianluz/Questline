import { cn } from "@/lib/utils";

/**
 * The universal JRPG-styled container. Replaces the old
 * `rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900`
 * card pattern across the app.
 *
 * Renders a parchment / starry-night panel with gold double border, four
 * diamond corner cuts, and subtle inner glow.
 *
 * Variants:
 *   default — the standard menu panel
 *   ornate  — adds a warmer gradient + brighter gold (for headers/heroes)
 *   danger  — crimson border, used for Boss Battle banner and the like
 */
export type JrpgPanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div" | "aside";
  variant?: "default" | "ornate" | "danger";
  inset?: "none" | "sm" | "md" | "lg";
};

export function JrpgPanel({
  as: Tag = "section",
  variant = "default",
  inset = "md",
  className,
  children,
  ...rest
}: JrpgPanelProps) {
  const padding =
    inset === "none"
      ? ""
      : inset === "sm"
        ? "p-3"
        : inset === "lg"
          ? "p-6"
          : "p-4";

  return (
    <Tag
      className={cn(
        "jrpg-panel relative",
        variant === "ornate" && "jrpg-panel--ornate",
        variant === "danger" && "jrpg-panel--danger",
        padding,
        className,
      )}
      {...rest}
    >
      {/* Top-right + bottom-left diamond cuts (top-left + bottom-right are
          drawn by ::before / ::after in globals.css). */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[5px] -right-[5px] h-2 w-2 rotate-45 bg-jrpg-gold"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[5px] -left-[5px] h-2 w-2 rotate-45 bg-jrpg-gold"
      />
      {children}
    </Tag>
  );
}
