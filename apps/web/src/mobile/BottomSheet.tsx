import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useDrag } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { useKeyboard, useKeyboardInsets } from "./Keyboard";
import { useScreenPortal } from "./PhoneFrame";
import { useMobileDevice } from "./Device";

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  snap?: number;
}>;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  snap = 0.72,
  children,
}: BottomSheetProps) {
  const { device } = useMobileDevice();
  const { screenRef } = useScreenPortal();
  const keyboard = useKeyboard();
  const { keyboardHeight } = useKeyboardInsets();
  const [dragY, setDragY] = useState(0);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) keyboard.hide();
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      keyboard.hide();
    }

    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open) return;

    let attachFrame: number | null = null;
    let cleanup: (() => void) | null = null;
    const attach = () => {
      const content = sheetContentRef.current;
      if (!content) {
        attachFrame = window.requestAnimationFrame(attach);
        return;
      }

      let frame: number | null = null;
      let previousScrollTop = content.scrollTop;
      const updateDetailActions = () => {
        frame = null;
        const sentinel = content.querySelector<HTMLElement>(".detail-actions-sentinel");
        const actions = content.querySelector<HTMLElement>(".detail-actions");
        if (!sentinel || !actions) return;
        const next = sentinel.getBoundingClientRect().bottom < content.getBoundingClientRect().top - 1;
        actions.classList.toggle("detail-actions-stuck", next);
        if (!next) {
          actions.classList.remove("detail-actions-scroll-down", "detail-actions-scroll-up");
        } else if (content.scrollTop > previousScrollTop + 1) {
          actions.classList.add("detail-actions-scroll-down");
          actions.classList.remove("detail-actions-scroll-up");
        } else if (content.scrollTop < previousScrollTop - 1) {
          actions.classList.add("detail-actions-scroll-up");
          actions.classList.remove("detail-actions-scroll-down");
        }
        previousScrollTop = content.scrollTop;
      };
      const scheduleUpdate = () => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(updateDetailActions);
      };
      const resizeObserver = new ResizeObserver(scheduleUpdate);
      const mutationObserver = new MutationObserver(scheduleUpdate);

      content.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.addEventListener("resize", scheduleUpdate);
      resizeObserver.observe(content);
      mutationObserver.observe(content, { childList: true, subtree: true });
      updateDetailActions();
      cleanup = () => {
        content.removeEventListener("scroll", scheduleUpdate);
        window.removeEventListener("resize", scheduleUpdate);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    };

    attach();
    return () => {
      if (attachFrame !== null) window.cancelAnimationFrame(attachFrame);
      cleanup?.();
    };
  }, [open]);

  const bindDrag = useDrag(
    (state) => {
      const [, movementY] = state.movement;
      const [, velocityY] = state.velocity;
      const [, directionY] = state.direction;
      const nextY = Math.max(0, movementY);

      if (!state.last) {
        setDragY(nextY);
        return;
      }

      const shouldClose = nextY > 96 || (velocityY > 0.55 && directionY > 0);
      setDragY(0);

      if (shouldClose) {
        onOpenChange(false);
      }
    },
    {
      axis: "y",
      filterTaps: true,
    },
  );

  // Native webviews can resize their actual screen when the browser chrome or
  // system keyboard changes. The calibrated geometry remains the source of
  // truth for the preview simulator, but native sheets must size from the
  // current screen element or a short viewport can clip the sheet above the
  // visible surface.
  const isNativeSurface = Boolean(screenRef.current?.closest(".app-shell-native"));
  const screenHeight = isNativeSurface && screenRef.current
    ? screenRef.current.clientHeight
    : device.geometry.screen.height;
  const sheetHeight = Math.round(screenHeight * snap);
  const effectiveHeight = Math.max(260, sheetHeight - Math.min(keyboardHeight, 180));
  const sheetBottom =
    device.platform === "android"
      ? Math.max(device.geometry.safeArea.bottom, keyboardHeight)
      : keyboardHeight;
  const portalContainer = screenRef.current ?? undefined;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {/* Keep the portal mounted after `open` flips so AnimatePresence can run
          the sheet and overlay exit animations before Radix removes them. */}
      <Dialog.Portal container={portalContainer} forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="sheet-overlay"
                  data-testid="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="bottom-sheet"
                  data-testid="bottom-sheet"
                  style={{
                    bottom: sheetBottom,
                    maxHeight: effectiveHeight,
                  }}
                  initial={{ y: effectiveHeight + 36 }}
                  animate={{ y: dragY }}
                  exit={{
                    y: effectiveHeight + 36,
                    transition: {
                      type: "spring",
                      stiffness: 250,
                      damping: 30,
                      mass: 1.05,
                    },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 43,
                    mass: 0.9,
                  }}
                >
                  <div className="sheet-handle-zone" data-testid="sheet-handle" {...bindDrag()}>
                    <div className="sheet-handle" />
                  </div>
                  <div className="sheet-header">
                    <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                    {description ? <Dialog.Description className="sheet-description">{description}</Dialog.Description> : null}
                    <Dialog.Close asChild>
                      <button className="sheet-close-button" type="button" aria-label="닫기" title="닫기" onClick={() => keyboard.hide()}>
                        <Cross2Icon width={18} height={18} aria-hidden="true" />
                      </button>
                    </Dialog.Close>
                  </div>
                  <div className="sheet-content" ref={sheetContentRef}>{children}</div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
