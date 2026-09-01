import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { InfoCircledIcon } from "@radix-ui/react-icons";

type BarcodeScannerProps = {
  onDetected: (value: string) => void;
  onCancel: () => void;
};

export default function BarcodeScanner({ onDetected, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState<"starting" | "scanning" | "unavailable">("starting");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!active) return;
        const rearCamera = devices.find((device) => /back|rear|environment|후면|후방/i.test(device.label));
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(rearCamera?.deviceId, videoRef.current ?? undefined, (result) => {
          if (!active || !result) return;
          active = false;
          controlsRef.current?.stop();
          onDetectedRef.current(result.getText());
        });
        if (!active) {
          controls.stop();
        } else {
          controlsRef.current = controls;
          setStatus("scanning");
        }
      } catch {
        if (active) setStatus("unavailable");
      }
    };

    void start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, []);

  return (
    <div className="scanner-flow" aria-live="polite">
      {status === "unavailable" ? (
        <div className="scanner-unavailable"><div className="capture-visual warning"><InfoCircledIcon width={24} height={24} /></div><strong>카메라를 사용할 수 없어요</strong><p>브라우저 권한을 허용하거나 아래 입력창에 바코드 숫자를 직접 입력해 주세요.</p></div>
      ) : (
        <div className="scanner-preview"><video ref={videoRef} aria-label="바코드 카메라 미리보기" autoPlay muted playsInline /><span className="scanner-frame" aria-hidden="true" /></div>
      )}
      <p className="scanner-status">{status === "starting" ? "카메라를 준비하고 있어요" : status === "scanning" ? "바코드를 화면 안에 맞춰 주세요" : "수동 입력으로도 상품 후보를 찾을 수 있어요"}</p>
      <button className="secondary-sheet-button" type="button" onClick={onCancel}>{status === "unavailable" ? "수동 입력으로 계속" : "카메라 닫기"}</button>
    </div>
  );
}
