import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Badge } from "@renderer/shared/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@renderer/shared/components/ui/card";
import { Input } from "@renderer/shared/components/ui/input";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Stat } from "@renderer/shared/components/ui/stat";
import { FeedItem } from "@renderer/shared/components/ui/feed-item";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Titlebar } from "@renderer/shared/components/chrome/Titlebar";
import { AppNav, type AppNavView } from "@renderer/shared/components/chrome/AppNav";
import { Statusbar } from "@renderer/shared/components/chrome/Statusbar";
import { Logo } from "@renderer/shared/components/Logo";
import { Check, RotateCw, AlertTriangle, Pause } from "@renderer/shared/lib/icons";

export function DevPrimitivesView() {
  const [theme, setTheme] = React.useState<"light" | "dark">(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [view, setView] = React.useState<AppNavView>("overview");

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "var(--dp-bg-app)",
        color: "var(--dp-text)",
      }}
    >
      {/* Chrome stack at the top */}
      <Titlebar
        version="2.5.7"
        theme={theme}
        onThemeToggle={toggleTheme}
        onSettingsClick={() => {}}
        connectionState="connected"
        apiLatencyMs={124}
        onWindowAction={(a) => console.log("window:", a)}
      />
      <AppNav
        view={view}
        onChange={setView}
        items={[
          { key: "overview", label: "overview" },
          { key: "inventory", label: "inventory" },
          { key: "control", label: "control" },
          { key: "priorities", label: "priorities" },
          { key: "settings", label: "settings" },
          { key: "debug", label: "debug" },
        ]}
        right={
          <>
            <span>shroud</span>
            <span style={{ color: "var(--dp-accent)" }}>●</span>
            <span>logged in</span>
          </>
        }
      />

      <div className="px-8 py-8 space-y-12 max-w-[1100px] mx-auto">
        <header className="flex items-center gap-3">
          <Logo size={20} />
          <h1 className="font-mono text-[14px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dimmer)]">
            Design Overhaul · Primitives Showcase
          </h1>
        </header>

        {/* Buttons */}
        <section>
          <SectionLabel>buttons</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="dp-primary" size="dp-md">
              claim now
            </Button>
            <Button variant="dp-secondary" size="dp-md">
              <Pause size={11} strokeWidth={1.8} /> pause
            </Button>
            <Button variant="dp-outline" size="dp-md">
              <RotateCw size={11} strokeWidth={1.8} /> switch target
            </Button>
            <Button variant="dp-ghost" size="dp-md">
              cancel
            </Button>
            <Button variant="dp-primary" size="dp-sm">
              sm
            </Button>
            <Button variant="dp-primary" size="dp-lg">
              lg
            </Button>
          </div>
        </section>

        {/* Pills & Badges */}
        <section>
          <SectionLabel>pills · badges</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="accent" dot>
              live
            </Pill>
            <Pill tone="ok" dot>
              connected
            </Pill>
            <Pill tone="warn" dot>
              retrying
            </Pill>
            <Pill tone="err" dot>
              failed
            </Pill>
            <Pill tone="info">api ok · 124ms</Pill>
            <Pill tone="dim">queued</Pill>
            <Badge variant="dp-accent">accent</Badge>
            <Badge variant="dp-ok">ok</Badge>
            <Badge variant="dp-warn">warn</Badge>
            <Badge variant="dp-err">err</Badge>
            <Badge variant="dp-info">info</Badge>
            <Badge variant="dp-dim">dim</Badge>
          </div>
        </section>

        {/* Inputs */}
        <section>
          <SectionLabel>inputs</SectionLabel>
          <div className="mt-3 flex max-w-md flex-col gap-2">
            <Input tone="dp" placeholder="search drops…" />
            <Input tone="dp" placeholder="username" defaultValue="shroud" />
          </div>
        </section>

        {/* Stat grid */}
        <section>
          <SectionLabel>stat grid</SectionLabel>
          <div
            className="mt-3 grid gap-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-6"
            style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
          >
            <Stat label="eta" value="02:14:38" sub="87% complete" accent />
            <Stat label="viewers" value="14,247" sub="+1.2K · 5m" subTone="warn" />
            <Stat label="next claim" value="02:14h" sub="auto-claim on" subTone="ok" />
            <Stat label="session" value="04:32:12" sub="3 drops earned" />
          </div>
        </section>

        {/* Card with panel-header pattern */}
        <section>
          <SectionLabel>card · panel pattern</SectionLabel>
          <Card className="mt-3 bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
            <CardHeader className="flex flex-row items-center border-b border-[color:var(--dp-border-soft)] py-3.5">
              <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
                queue · next up
              </CardTitle>
              <CardAction>manage →</CardAction>
            </CardHeader>
            <CardContent className="p-0">
              <Table columns="40px 2fr 1.2fr 0.8fr 0.8fr 0.8fr">
                <TableHead>
                  <span>#</span>
                  <span>game · channel</span>
                  <span>drop</span>
                  <span>eta</span>
                  <span>viewers</span>
                  <span>status</span>
                </TableHead>
                <TableRow interactive>
                  <TableCell mono dim>
                    02
                  </TableCell>
                  <TableCell>
                    Counter-Strike 2
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">
                      s1mple
                    </div>
                  </TableCell>
                  <TableCell>Major Sticker</TableCell>
                  <TableCell mono dim>
                    04:00h
                  </TableCell>
                  <TableCell mono dim>
                    8.4K
                  </TableCell>
                  <TableCell>
                    <Pill tone="dim">queued</Pill>
                  </TableCell>
                </TableRow>
                <TableRow interactive>
                  <TableCell mono dim>
                    03
                  </TableCell>
                  <TableCell>
                    Apex Legends
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">
                      timthetatman
                    </div>
                  </TableCell>
                  <TableCell>Charge Rifle Skin</TableCell>
                  <TableCell mono dim>
                    06:30h
                  </TableCell>
                  <TableCell mono dim>
                    12.1K
                  </TableCell>
                  <TableCell>
                    <Pill tone="dim">queued</Pill>
                  </TableCell>
                </TableRow>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* Feed */}
        <section>
          <SectionLabel>activity feed</SectionLabel>
          <div className="mt-3 max-w-md rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4">
            <FeedItem
              tone="ok"
              icon={<Check />}
              msg={
                <>
                  Claimed <strong>Rivals Banner</strong>
                </>
              }
              meta={<>rust · 12 min ago</>}
            />
            <FeedItem
              tone="info"
              icon={<RotateCw />}
              msg={
                <>
                  Switched to <strong>shroud</strong>
                </>
              }
              meta={<>rust · 38 min ago</>}
            />
            <FeedItem
              tone="warn"
              icon={<AlertTriangle />}
              msg="No progress · probe recovery"
              meta={<>apex · 2h ago</>}
              last
            />
          </div>
        </section>
      </div>

      <Statusbar
        left={[
          { tone: "ok", label: "engine: running" },
          { label: "watch.cycle 30s" },
          { label: "3 drops · today" },
        ]}
        right={[
          { label: "cpu 2.1%" },
          { label: "mem 142mb" },
          { label: <span style={{ color: "var(--dp-accent)" }}>⌘K</span> },
        ]}
      />
    </div>
  );
}
