"use client";

import { Banner, BannerAction, BannerActions, BannerDescription, BannerTitle } from "@/components/ui/banner";

export function StaleRefreshWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner status="warning" contrast="high">
      <BannerTitle>Couldn&apos;t refresh this experiment</BannerTitle>
      <BannerDescription>Showing data from the last successful load. It may be out of date.</BannerDescription>
      <BannerActions>
        <BannerAction onClick={onRetry}>Retry</BannerAction>
      </BannerActions>
    </Banner>
  );
}
