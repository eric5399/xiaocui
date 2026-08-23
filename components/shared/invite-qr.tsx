"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

type InviteQrProps = {
  value: string;
  inviteCode: string;
  size?: number;
};

export function InviteQr({ value, inviteCode, size = 152 }: InviteQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setFailed(false);
    const resolvedValue = value.startsWith("/")
      ? `${window.location.origin}${value}`
      : value;
    void QRCode.toCanvas(canvas, resolvedValue, {
      width: size,
      margin: 1,
      color: { dark: "#193b55", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => setFailed(true));
  }, [size, value]);

  return (
    <figure className="m-0 text-center">
      <div className="inline-grid min-h-[168px] min-w-[168px] place-items-center rounded-[12px] border border-[var(--line)] bg-white p-2">
        {failed ? (
          <span className="max-w-[136px] text-[12px] leading-5 text-[var(--danger)]">二维码生成失败，请使用下方邀请码进入。</span>
        ) : (
          <canvas ref={canvasRef} aria-label={`任务邀请二维码，邀请码 ${inviteCode}`} role="img" />
        )}
      </div>
      <figcaption className="font-mono mt-2 text-[12px] font-bold tracking-[0.12em] text-[var(--navy)]">{inviteCode}</figcaption>
    </figure>
  );
}
