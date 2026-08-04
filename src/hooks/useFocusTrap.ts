import { useEffect, useRef } from "react";

/**
 * useFocusTrap — accessible modal focus management.
 *
 * - Moves focus into the dialog on mount (first focusable element)
 * - Traps Tab / Shift+Tab within the dialog (Run Card Phase F: Dialog Focus Trap)
 * - Restores focus to the previously focused element on unmount
 *   (Run Card Phase F: Focus Restoration)
 *
 * Usage:
 *   const dialogRef = useFocusTrap(true);
 *   <div className="modal-dialog" ref={dialogRef} role="dialog" ...>
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function useFocusTrap(active: boolean, restoreOnClose = true) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement;

    const getFocusables = (): HTMLElement[] =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el: HTMLElement) => el.offsetParent !== null || el === document.activeElement,
      );

    // Initial focus into the dialog
    getFocusables()[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = getFocusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (
        restoreOnClose &&
        previouslyFocused.current instanceof HTMLElement
      ) {
        previouslyFocused.current.focus();
      }
    };
  }, [active, restoreOnClose]);

  return containerRef;
}
