import { useState, useCallback, useEffect, useRef } from "react";
import { useConfigStore } from "@renderer/store/config.store";

export function useReportAvailability() {
  const { projectPath } = useConfigStore();
  const [reportAvailability, setReportAvailability] = useState({ playwright: false, bdd: false, allure: false });
  const [showReportMenu, setShowReportMenu] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);

  const checkReportAvailability = useCallback(() => {
    if (!projectPath || !window.specwright.report) return;
    window.specwright.report.checkAvailable(projectPath).then(setReportAvailability);
  }, [projectPath]);

  useEffect(() => {
    checkReportAvailability();
  }, [checkReportAvailability]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setShowReportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return { reportAvailability, showReportMenu, setShowReportMenu, reportMenuRef, checkReportAvailability };
}
