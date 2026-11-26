import { cn } from "@/lib/utils";

/** A card-like section, centred in the page column. */
const Container = ({
  children,
  className,
  as = "section",
  ...props
}: React.ComponentProps<"section"> & {
  as?: "section" | "div" | "article";
}) => {
  const Component = as as "section";
  return (
    <Component
      className={cn(
        "bg-card text-card-foreground mx-auto mt-6 w-full rounded-2xl border p-5 shadow-sm sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
};
export default Container;

/** Page column: consistent max width and gutters for every page. */
export const Page = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6", className)}>
    {children}
  </div>
);

export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) => (
  <header
    className={cn(
      "flex flex-col gap-4 pt-8 sm:flex-row sm:items-end sm:justify-between md:pt-12",
      className,
    )}
  >
    <div className="space-y-1.5">
      {eyebrow && (
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground max-w-prose text-pretty">{description}</p>
      )}
    </div>
    {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
  </header>
);

export const SectionTitle = ({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="mb-4 flex items-start justify-between gap-4">
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
    {action}
  </div>
);
