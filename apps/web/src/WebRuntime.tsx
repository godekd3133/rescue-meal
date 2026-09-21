import { useRef, type PropsWithChildren } from "react";
import { KeyboardProvider, MobileDeviceProvider, ScreenPortalProvider } from "./mobile";

export function WebRuntime({ children }: PropsWithChildren) {
  const screenRef = useRef<HTMLDivElement | null>(null);

  return (
    <MobileDeviceProvider>
      <ScreenPortalProvider screenRef={screenRef}>
        <KeyboardProvider>
          <div className="web-runtime-surface" data-testid="web-runtime-surface" ref={screenRef}>
            {children}
          </div>
        </KeyboardProvider>
      </ScreenPortalProvider>
    </MobileDeviceProvider>
  );
}
