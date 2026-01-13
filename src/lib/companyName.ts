"use client";

import { useEffect, useState } from "react";
import { DEFAULT_COMPANY_NAME } from "@/lib/config";

const STORAGE_KEY = "rc_company_name";

export function getCompanyNameClient() {
  if (typeof window === "undefined") return DEFAULT_COMPANY_NAME;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v?.trim() ? v.trim() : DEFAULT_COMPANY_NAME;
}

export function setCompanyNameClient(next: string) {
  if (typeof window === "undefined") return;
  const v = next.trim();
  window.localStorage.setItem(STORAGE_KEY, v);
  window.dispatchEvent(new Event("rc_company_name_changed"));
}

export function useCompanyName() {
  const [name, setName] = useState<string>(DEFAULT_COMPANY_NAME);

  useEffect(() => {
    setName(getCompanyNameClient());

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setName(getCompanyNameClient());
    }
    function onCustom() {
      setName(getCompanyNameClient());
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("rc_company_name_changed", onCustom as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rc_company_name_changed", onCustom as any);
    };
  }, []);

  return {
    companyName: name,
    setCompanyName: (next: string) => {
      setCompanyNameClient(next);
      setName(getCompanyNameClient());
    },
  };
}

