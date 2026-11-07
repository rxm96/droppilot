import type * as React from "react";

export type SettingsPanelProps = {
  /** Anchor id the index links to. */
  id: string;
  title: string;
  children: React.ReactNode;
  /** Shown under the panel (e.g. a link to another screen). */
  footer?: React.ReactNode;
};

/** A settings section: mono kicker heading over a panel of rows. */
export function SettingsPanel({ id, title, children, footer }: SettingsPanelProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-4">
      <h2
        id={headingId}
        className="m-0 mb-2.5 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
      >
        {title}
      </h2>
      <div className="divide-y divide-[color:var(--dp-border)] rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
        {children}
      </div>
      {footer}
    </section>
  );
}
