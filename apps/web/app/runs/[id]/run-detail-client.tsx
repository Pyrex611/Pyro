"use client";

import RunDetailPage from "./page";

export function RunDetailClient({ id }: { id: string }) {
  return <RunDetailPage params={{ id }} />;
}