"use client";

interface OperationOverlayProps {
  open: boolean;
  title: string;
  subtitle?: string;
}

export default function OperationOverlay({ open, title, subtitle = "请等待，当前任务正在处理中..." }: OperationOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4 backdrop-blur-md">
      <div className="relative flex min-h-[280px] w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#050510]/95 px-8 py-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.48)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(111,123,255,0.18),transparent_34%),radial-gradient(circle_at_50%_82%,rgba(219,72,255,0.12),transparent_42%)]" />
        <div className="relative h-36 w-36">
          <div className="operation-energy-orbit" />
          <div className="operation-energy-ball">
            <div className="operation-energy-flow operation-energy-flow-a" />
            <div className="operation-energy-flow operation-energy-flow-b" />
            <div className="operation-energy-flow operation-energy-flow-c" />
            <div className="operation-energy-gloss" />
          </div>
        </div>
        <h3 className="relative mt-7 text-lg font-semibold tracking-wide text-white">{title}</h3>
        <p className="relative mt-2 text-sm leading-6 text-white/70">{subtitle}</p>
        <div className="relative mt-5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7dd3fc]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8b5cf6] [animation-delay:160ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f0abfc] [animation-delay:320ms]" />
        </div>
      </div>

      <style>{`
        .operation-energy-orbit {
          position: absolute;
          inset: -18px;
          border-radius: 9999px;
          background:
            conic-gradient(from 20deg, transparent 0 16%, rgba(122, 92, 255, 0.9) 22%, rgba(69, 203, 255, 0.8) 31%, transparent 42% 58%, rgba(238, 72, 255, 0.86) 67%, rgba(79, 70, 229, 0.82) 75%, transparent 86% 100%);
          filter: blur(0.5px) drop-shadow(0 0 18px rgba(86, 100, 255, 0.78));
          animation: operationOrbit 2.7s linear infinite;
          opacity: 0.86;
          mask: radial-gradient(circle, transparent 57%, #000 59%, #000 64%, transparent 66%);
        }

        .operation-energy-ball {
          position: absolute;
          inset: 10px;
          overflow: hidden;
          border-radius: 9999px;
          background:
            radial-gradient(circle at 76% 72%, rgba(255, 255, 255, 0.9), transparent 15%),
            radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.55), transparent 22%),
            radial-gradient(circle at 72% 28%, rgba(219, 39, 255, 0.88), transparent 28%),
            radial-gradient(circle at 36% 76%, rgba(72, 88, 255, 0.92), transparent 34%),
            linear-gradient(135deg, #9bbcff 0%, #6d5cff 34%, #d946ef 68%, #7dd3fc 100%);
          box-shadow:
            inset 0 0 18px rgba(255, 255, 255, 0.38),
            inset 0 -18px 34px rgba(27, 24, 130, 0.58),
            0 0 22px rgba(75, 104, 255, 0.9),
            0 0 58px rgba(168, 85, 247, 0.46);
          animation: operationPulse 2.4s ease-in-out infinite;
        }

        .operation-energy-ball::before {
          content: "";
          position: absolute;
          inset: 3px;
          border-radius: inherit;
          border: 2px solid rgba(151, 160, 255, 0.72);
          box-shadow: inset 0 0 18px rgba(255, 255, 255, 0.18);
          pointer-events: none;
        }

        .operation-energy-flow {
          position: absolute;
          border-radius: 9999px;
          filter: blur(10px);
          mix-blend-mode: screen;
          opacity: 0.82;
        }

        .operation-energy-flow-a {
          left: -12%;
          top: 18%;
          height: 58%;
          width: 82%;
          background: rgba(127, 211, 252, 0.72);
          animation: operationFlowA 4.2s ease-in-out infinite alternate;
        }

        .operation-energy-flow-b {
          right: -20%;
          top: 12%;
          height: 78%;
          width: 62%;
          background: rgba(217, 70, 239, 0.78);
          animation: operationFlowB 3.6s ease-in-out infinite alternate;
        }

        .operation-energy-flow-c {
          left: 20%;
          bottom: -22%;
          height: 72%;
          width: 72%;
          background: rgba(99, 102, 241, 0.88);
          animation: operationFlowC 4.8s ease-in-out infinite alternate;
        }

        .operation-energy-gloss {
          position: absolute;
          right: 10%;
          bottom: 15%;
          height: 34%;
          width: 18%;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.82);
          filter: blur(8px);
          transform: rotate(28deg);
          opacity: 0.86;
          animation: operationGloss 2.8s ease-in-out infinite alternate;
        }

        @keyframes operationOrbit {
          to { transform: rotate(360deg); }
        }

        @keyframes operationPulse {
          0%, 100% { transform: scale(0.98); }
          50% { transform: scale(1.035); }
        }

        @keyframes operationFlowA {
          from { transform: translate(-8%, -4%) rotate(0deg) scale(1); }
          to { transform: translate(18%, 12%) rotate(22deg) scale(1.16); }
        }

        @keyframes operationFlowB {
          from { transform: translate(8%, 0%) rotate(8deg) scale(1); }
          to { transform: translate(-18%, 15%) rotate(-24deg) scale(1.12); }
        }

        @keyframes operationFlowC {
          from { transform: translate(0%, 8%) rotate(-12deg) scale(1); }
          to { transform: translate(6%, -18%) rotate(18deg) scale(1.18); }
        }

        @keyframes operationGloss {
          from { transform: translate(0, 0) rotate(28deg) scaleY(0.92); }
          to { transform: translate(-12px, -18px) rotate(34deg) scaleY(1.14); }
        }
      `}</style>
    </div>
  );
}
