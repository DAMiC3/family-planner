"use client";

import { useEffect, useRef } from "react";

/** Hidden input carrying the browser's timezone (e.g. "Africa/Johannesburg"). */
export function TimezoneInput({ name = "timezone" }: { name?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);
  return <input ref={ref} type="hidden" name={name} defaultValue="" />;
}
