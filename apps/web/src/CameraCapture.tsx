import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CameraIcon, CheckIcon, Cross2Icon, InfoCircledIcon, UploadIcon } from "@radix-ui/react-icons";

export type CaptureFileHandler = (file: File) => void | Promise<void>;

type CameraCaptureProps = {
  title: string;
  detail: string;
  onFile: CaptureFileHandler;
  onCancel: () => void;
};

type CameraStatus = "starting" | "ready" | "unavailable";
type CaptureCrop = { x: number; y: number; width: number; height: number };

function frameCrop(video: HTMLVideoElement, frame: HTMLElement): CaptureCrop | null {
  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (!videoRect.width || !videoRect.height || !frameRect.width || !frameRect.height || !video.videoWidth || !video.videoHeight) return null;

  // The preview uses object-fit: cover. Recreate that mapping so the pixels
  // inside the visible guide, rather than the surrounding room/background, are
  // sent to OCR. If a browser does not expose layout metrics, the caller falls
  // back to the uncropped frame.
  const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const renderedWidth = video.videoWidth * scale;
  const renderedHeight = video.videoHeight * scale;
  const offsetX = (renderedWidth - videoRect.width) / 2;
  const offsetY = (renderedHeight - videoRect.height) / 2;
  const x = (frameRect.left - videoRect.left + offsetX) / scale;
  const y = (frameRect.top - videoRect.top + offsetY) / scale;
  const width = frameRect.width / scale;
  const height = frameRect.height / scale;
  const left = Math.max(0, Math.min(video.videoWidth, x));
  const top = Math.max(0, Math.min(video.videoHeight, y));
  const right = Math.max(left, Math.min(video.videoWidth, x + width));
  const bottom = Math.max(top, Math.min(video.videoHeight, y + height));
  if (right - left < 32 || bottom - top < 32) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function CameraLibraryFallback({ onFile }: { onFile: CaptureFileHandler }) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void onFile(file);
  };

  return (
    <label className="secondary-sheet-button file-button camera-library-fallback">
      <UploadIcon width={17} height={17} /> 사진에서 선택
      <input type="file" accept="image/*" data-input-source="library" aria-label="사진에서 선택" onChange={handleChange} />
    </label>
  );
}

export default function CameraCapture({ title, detail, onFile, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onFileRef = useRef(onFile);
  const onCancelRef = useRef(onCancel);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    onFileRef.current = onFile;
    onCancelRef.current = onCancel;
  }, [onCancel, onFile]);

  useEffect(() => {
    let active = true;
    let removeVideoListeners: (() => void) | null = null;
    let removeTrackListener: (() => void) | null = null;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("이 브라우저는 실시간 카메라를 지원하지 않아요.");
        setStatus("unavailable");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 1440 },
            width: { ideal: 1920 },
          },
        });

        if (!active) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopStream(stream);
          streamRef.current = null;
          setMessage("카메라 화면을 준비하지 못했어요. 사진에서 선택해 주세요.");
          setStatus("unavailable");
          return;
        }

        const markReady = () => {
          if (!active || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
          setMessage("");
          setStatus("ready");
        };
        const handlePlaybackError = () => {
          if (!active || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
          setMessage("카메라 화면을 표시하지 못했어요. 사진에서 선택해 주세요.");
          setStatus("unavailable");
        };
        const handleTrackEnded = () => {
          if (!active) return;
          setMessage("카메라 연결이 끊겼어요. 다시 촬영하거나 사진을 선택해 주세요.");
          setStatus("unavailable");
        };

        video.addEventListener("loadedmetadata", markReady);
        video.addEventListener("canplay", markReady);
        removeVideoListeners = () => {
          video.removeEventListener("loadedmetadata", markReady);
          video.removeEventListener("canplay", markReady);
        };
        const track = stream.getVideoTracks()[0];
        track?.addEventListener("ended", handleTrackEnded);
        removeTrackListener = track ? () => track.removeEventListener("ended", handleTrackEnded) : null;
        video.srcObject = stream;
        void video.play().then(markReady).catch(handlePlaybackError);
        markReady();
      } catch {
        if (!active) return;
        setMessage("카메라 권한이 없거나 다른 앱에서 사용 중이에요.");
        setStatus("unavailable");
      }
    };

    void start();
    return () => {
      active = false;
      removeVideoListeners?.();
      removeTrackListener?.();
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setMessage("카메라 화면이 아직 준비되지 않았어요. 잠시 후 다시 눌러 주세요.");
      return;
    }

    const crop = frameRef.current ? frameCrop(video, frameRef.current) : null;
    const source = crop ?? { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width));
    canvas.height = Math.max(1, Math.round(source.height));
    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("촬영 이미지를 준비하지 못했어요. 사진에서 선택해 주세요.");
      return;
    }

    context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage("촬영 이미지를 준비하지 못했어요. 사진에서 선택해 주세요.");
        return;
      }
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const file = new File([blob], `rescue-meal-${timestamp}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      stopStream(streamRef.current);
      streamRef.current = null;
      void onFileRef.current(file);
    }, "image/jpeg", 0.92);
  };

  if (status === "unavailable") {
    return (
      <div className="camera-capture camera-capture-unavailable" role="region" aria-label={`${title} 카메라 입력`} aria-live="polite" aria-atomic="true">
        <div className="capture-visual warning"><InfoCircledIcon width={25} height={25} /></div>
        <h3>카메라를 사용할 수 없어요</h3>
        <p>{message || "카메라를 준비하지 못했어요."}</p>
        <div className="camera-capture-fallback-actions">
          <CameraLibraryFallback onFile={onFileRef.current} />
          <button className="secondary-sheet-button" type="button" onClick={() => onCancelRef.current()}>입력 방법 다시 보기</button>
        </div>
        <div className="capture-hint"><CheckIcon width={14} height={14} /> 사진을 선택해도 같은 품질 검사와 OCR 검토를 거쳐요.</div>
      </div>
    );
  }

  return (
    <div className="camera-capture" role="region" aria-label={`${title} 카메라 입력`}>
      <div className="camera-capture-heading">
        <span className="camera-capture-heading-icon"><CameraIcon width={16} height={16} /></span>
        <span><strong>{title} 촬영</strong><small>{detail}</small></span>
        <button className="camera-capture-close" type="button" aria-label="카메라 닫기" onClick={() => onCancelRef.current()}><Cross2Icon width={17} height={17} /></button>
      </div>
      <div className="camera-capture-viewfinder">
        <video ref={videoRef} data-camera-facing="environment" aria-label={`${title} 카메라 미리보기`} autoPlay muted playsInline />
        <span ref={frameRef} className="camera-capture-frame" aria-hidden="true"><i /><i /><i /><i /></span>
        <div className="camera-capture-guide" aria-hidden="true"><strong>{title === "영수증" ? "영수증 전체" : "날짜가 보이는 면"}</strong><small>테두리 안에 맞춰 주세요 · 안쪽만 분석해요</small></div>
      </div>
      <p className="camera-capture-status" role="status">{status === "starting" ? "카메라를 준비하고 있어요" : message || "흔들리지 않게 화면을 맞춘 뒤 촬영하세요"}</p>
      <div className="camera-capture-actions">
        <button className="primary-sheet-button" type="button" disabled={status !== "ready"} onClick={capture}><CameraIcon width={17} height={17} /> 촬영하기</button>
        <CameraLibraryFallback onFile={onFileRef.current} />
      </div>
      <p className="capture-hint"><InfoCircledIcon width={14} height={14} /> 원본 이미지는 촬영 후 OCR 처리에만 사용하고 재고 기록에는 저장하지 않아요.</p>
    </div>
  );
}
