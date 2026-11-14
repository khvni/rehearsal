"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Same project/host as alikhani.co; env-overridable at build time.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_p7D6e5BTGZL456Qt5jMMwL5d7ZQiS6MhnaXeFZGc6eZa";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function PostHogInit() {
  useEffect(() => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: "2025-05-24",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);
  return null;
}
