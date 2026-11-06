import { HeroPanel, type HeroPanelProps } from "./HeroPanel";
import { NeedsYouPanel, type NeedsYouPanelProps } from "./NeedsYouPanel";
import { EnginePanel, type EnginePanelProps } from "./EnginePanel";
import { PlanPanel, type PlanPanelProps } from "./PlanPanel";
import { ActivityPanel } from "./ActivityPanel";
import type { ChannelPickerProps } from "./ChannelPicker";

type OverviewProps = {
  hero: Omit<HeroPanelProps, "picker">;
  picker: ChannelPickerProps;
  needsYou: NeedsYouPanelProps;
  engine: EnginePanelProps;
  plan: PlanPanelProps;
};

/**
 * The merged overview (Overview + the former Control view): hero with channel
 * switching, needs-you, engine, plan · today and activity.
 */
export function OverviewView({ hero, picker, needsYou, engine, plan }: OverviewProps) {
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <HeroPanel {...hero} picker={picker} />
      <div className="flex flex-col gap-5">
        <NeedsYouPanel {...needsYou} />
        <EnginePanel {...engine} />
      </div>
      <PlanPanel {...plan} />
      <ActivityPanel />
    </div>
  );
}
