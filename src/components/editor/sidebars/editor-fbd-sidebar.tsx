import { Gauge } from "lucide-react";
import { PaletteGroup, SidebarSearch, SidebarShell } from "./sidebar-primitives";
import { paletteDefinitions } from "@/lib/fbd/editor-bridge";
import { effectiveInputs, effectiveOutputs } from "@/lib/fbd/engine";

export function EditorFbdSidebar() {
  const defs = paletteDefinitions();
  const blocksByCategory = new Map<string, typeof defs>();
  for (const def of defs) {
    const list = blocksByCategory.get(def.category) ?? [];
    list.push(def);
    blocksByCategory.set(def.category, list);
  }

  return (
    <SidebarShell>
      <SidebarSearch title="Blocos FBD" placeholder="AND, OR, TON..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {[...blocksByCategory].map(([category, items]) => {
          return (
            <PaletteGroup key={category} icon={Gauge} title={category}>
              {items.map((def) => (
                <button
                  key={def.type}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/fbd-block", def.type);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  title={def.description}
                  className="flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] hover:bg-accent border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
                >
                  <span className="w-12 shrink-0 font-mono text-[10px] text-primary">
                    {def.type}
                  </span>
                  <span className="truncate flex-1">{def.description}</span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">
                    {effectiveInputs(def).length}&rarr;{effectiveOutputs(def).length}
                  </span>
                </button>
              ))}
            </PaletteGroup>
          );
        })}
      </div>
    </SidebarShell>
  );
}
