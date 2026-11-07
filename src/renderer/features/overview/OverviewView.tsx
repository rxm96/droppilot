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
 * The merged overview (Overview + the former Control view).
 *
 * Wide: hero over plan on the left; needs-you, engine and activity stacked on
 * the right (spanning both rows, so a tall right column never pushes the plan
 * down). Narrow: one column in reading order — hero, needs-you, plan, engine,
 * activity — via `contents` + `order` on the right column.
 */
export function OverviewView({ hero, picker, needsYou, engine, plan }: OverviewProps) {
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:grid-rows-[auto_1fr]">
      <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
        <HeroPanel {...hero} picker={picker} />
      </div>
      <div className="contents lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-5">
        {needsYou.items.length > 0 && (
          <div className="order-2">
            <NeedsYouPanel {...needsYou} />
          </div>
        )}
        <div className="order-4">
          <EnginePanel {...engine} />
        </div>
        <div className="order-5">
          <ActivityPanel />
        </div>
      </div>
      <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
        <PlanPanel {...plan} />
      </div>
    </div>
  );
}
