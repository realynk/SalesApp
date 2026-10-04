import type { ReactNode } from "react";

export function BoardScroller({ children }: { children: ReactNode }) {
  return (
    <div className="board-x-scroll h-[calc(100dvh-18rem)] min-h-80">
      <div className="flex h-full min-w-max items-stretch gap-3 pb-1">{children}</div>
    </div>
  );
}
