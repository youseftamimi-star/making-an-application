"use client";
import { createContext, useContext } from "react";
import type { Me } from "@/lib/client";

export const MeContext = createContext<Me | null>(null);
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside app layout");
  return me;
}
