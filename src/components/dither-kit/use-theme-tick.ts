import { useEffect, useState } from "react";
import { THEME_CHANGE_EVENT } from "../../theme";

/** Increments whenever the app theme flips — chart roots add it to their
 * replay token so canvases repaint with the new theme's palette. */
export function useThemeTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handleThemeChange = () => setTick((value) => value + 1);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);
  return tick;
}
