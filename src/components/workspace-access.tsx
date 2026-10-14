"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceAccessContext = createContext({ canWrite: false });

export function WorkspaceAccessProvider({
  canWrite,
  children,
}: {
  canWrite: boolean;
  children: ReactNode;
}) {
  return <WorkspaceAccessContext.Provider value={{ canWrite }}>{children}</WorkspaceAccessContext.Provider>;
}

export function useCanWriteCrm() {
  return useContext(WorkspaceAccessContext).canWrite;
}

export function WriteOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useCanWriteCrm() ? children : fallback;
}
