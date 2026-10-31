import type { ReactNode } from "react";

/** Sticky action bar that respects the phone's safe area. */
export const BottomBar = ({ children }: { children: ReactNode }) => (
  <div
    className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 backdrop-blur px-5 pt-3"
    style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
  >
    {children}
  </div>
);
