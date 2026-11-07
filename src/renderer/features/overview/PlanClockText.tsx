import type { PlanClock } from "./planTable";

/** A plan clock time ("14:34"), with a small "+1d" when it falls on a later day. */
export function PlanClockText({ value }: { value: PlanClock }) {
  return (
    <>
      {value.clock}
      {value.dayOffset > 0 && (
        <sup className="ml-0.5 text-[9px] text-[color:var(--dp-text-dimmer)]">
          +{value.dayOffset}d
        </sup>
      )}
    </>
  );
}
