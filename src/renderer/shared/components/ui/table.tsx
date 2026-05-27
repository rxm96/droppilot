import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

/**
 * Table primitives use CSS grid for column alignment so consumers can
 * pass any `gridTemplateColumns` template (e.g. "36px 1fr 100px 80px").
 * Rows and head share the same template via a context.
 */
type TableContextValue = { columns: string };
const TableContext = React.createContext<TableContextValue | null>(null);

function useTableColumns(component: string): string {
  const ctx = React.useContext(TableContext);
  if (!ctx) {
    throw new Error(`${component} must be used inside <Table>`);
  }
  return ctx.columns;
}

export type TableProps = React.HTMLAttributes<HTMLDivElement> & {
  /** CSS grid-template-columns value, e.g. "36px 2fr 1fr 1fr 100px". */
  columns: string;
  /** Visual density. */
  density?: "dense" | "comfortable";
};

export const Table = React.forwardRef<HTMLDivElement, TableProps>(
  ({ className, columns, density: _density = "dense", children, ...props }, ref) => (
    <TableContext.Provider value={{ columns }}>
      <div ref={ref} role="table" className={cn("w-full text-[13px]", className)} {...props}>
        {children}
      </div>
    </TableContext.Provider>
  ),
);
Table.displayName = "Table";

export const TableHead = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const columns = useTableColumns("TableHead");
    return (
      <div
        ref={ref}
        role="row"
        className={cn(
          "grid h-8 items-center gap-4 border-b border-[color:var(--dp-border-soft)] px-5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]",
          className,
        )}
        style={{ gridTemplateColumns: columns }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TableHead.displayName = "TableHead";

export type TableRowProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Renders the row as a button-like clickable element. */
  interactive?: boolean;
};

export const TableRow = React.forwardRef<HTMLDivElement, TableRowProps>(
  ({ className, interactive, children, ...props }, ref) => {
    const columns = useTableColumns("TableRow");
    return (
      <div
        ref={ref}
        role="row"
        className={cn(
          "grid h-[52px] items-center gap-4 border-b border-[color:var(--dp-border-soft)] px-5 transition-colors last:border-b-0",
          interactive && "cursor-pointer hover:bg-[color:var(--dp-bg-elevated-2)]",
          className,
        )}
        style={{ gridTemplateColumns: columns }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TableRow.displayName = "TableRow";

export type TableCellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Apply mono numeric/data styling. */
  mono?: boolean;
  /** Dim the value (used for "—" / empty / placeholder cells). */
  dim?: boolean;
};

export const TableCell = React.forwardRef<HTMLDivElement, TableCellProps>(
  ({ className, mono, dim, children, ...props }, ref) => (
    <div
      ref={ref}
      role="cell"
      className={cn(
        "min-w-0 truncate",
        mono && "font-mono text-[12px]",
        dim && "text-[color:var(--dp-text-dim)]",
        !dim && !mono && "text-[color:var(--dp-text)]",
        mono && !dim && "text-[color:var(--dp-text)]",
        className,
      )}
      style={mono ? { fontFeatureSettings: '"tnum"' } : undefined}
      {...props}
    >
      {children}
    </div>
  ),
);
TableCell.displayName = "TableCell";
