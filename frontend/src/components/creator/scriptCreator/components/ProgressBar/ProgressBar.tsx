import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function ProgressBar() {
  const { progress, isGenerating, stopGeneration } = useApp();
  const liveOutputRef = useRef<HTMLPreElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const hasLiveOutput = Boolean(progress.liveOutput);
  const progressStartedAt = progress.startedAt ? new Date(progress.startedAt).getTime() : null;

  if (isGenerating && progressStartedAt && Number.isFinite(progressStartedAt)) {
    startedAtRef.current = progressStartedAt;
    if (lastActivityAtRef.current === null) lastActivityAtRef.current = progressStartedAt;
  } else if (isGenerating && startedAtRef.current === null) {
    const timestamp = Date.now();
    startedAtRef.current = timestamp;
    lastActivityAtRef.current = timestamp;
  }

  if (!isGenerating && startedAtRef.current !== null) {
    startedAtRef.current = null;
    lastActivityAtRef.current = null;
  }

  useEffect(() => {
    const element = liveOutputRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [progress.liveOutput]);

  useEffect(() => {
    if (!isGenerating) return;
    lastActivityAtRef.current = Date.now();
    setNow(Date.now());
  }, [isGenerating, progress.liveOutput, progress.message, progress.progress, progress.subMessage]);

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  if (!isGenerating && progress.step === 'idle') return null;

  const elapsedText = startedAtRef.current ? formatElapsed(now - startedAtRef.current) : '00:00';
  const activitySeconds = lastActivityAtRef.current ? Math.max(0, Math.floor((now - lastActivityAtRef.current) / 1000)) : 0;
  const activityText = activitySeconds <= 1 ? '刚刚有响应' : `${activitySeconds}秒前有响应`;

  return (
    <>
      <div aria-hidden="true" className={hasLiveOutput ? 'h-[22rem]' : 'h-[12rem]'} />
      <section
      aria-live="polite"
      className={`fixed left-5 right-5 top-5 z-50 flex max-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-2xl border border-blue-400/25 bg-[#0b1725]/96 p-5 shadow-2xl backdrop-blur-md lg:left-[280px] lg:right-8 ${
        hasLiveOutput ? 'h-[22rem]' : 'min-h-[12rem]'
      }`}
    >
      <div className="mb-4 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">生产状态</p>
            {isGenerating && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                工作中
              </span>
            )}
            {isGenerating && (
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-bold text-blue-200">
                已运行 {elapsedText}
              </span>
            )}
            {isGenerating && (
              <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-3 py-1 text-xs font-bold text-slate-300">
                {activityText}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-xl font-black leading-7 text-white">{progress.message}</h3>
          {progress.subMessage && <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-400">{progress.subMessage}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {isGenerating && (
            <button
              type="button"
              onClick={stopGeneration}
              className="h-10 rounded-xl border border-red-400/70 px-4 text-sm font-black text-red-300 hover:bg-red-500/10"
            >
              停止
            </button>
          )}
          <div className="bg-gradient-to-r from-blue-400 to-fuchsia-400 bg-clip-text text-3xl font-black text-transparent">
            {progress.progress}%
          </div>
        </div>
      </div>

      <div className="relative h-3 shrink-0 overflow-hidden rounded-full bg-[#1d2a3e]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-amber-300 transition-all duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {(progress.step === 'generating_episode' || progress.step === 'self_checking') && (
        <div className="mt-3 line-clamp-2 shrink-0 rounded-xl border border-[#26354d] bg-[#081321] px-3 py-2 text-xs leading-5 text-slate-400">
          系统正在逐集生成并后台自检：开头钩子、15秒留存、上下集连贯、主线状态、人物动机、红果风险和格式质量。
        </div>
      )}

      {hasLiveOutput && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-xl border border-blue-400/30 bg-[#081321] px-4 py-3 shadow-[0_0_0_1px_rgba(96,165,250,0.08)]">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
            <p className="text-sm font-black text-blue-300">
              {progress.step === 'generating_schemes' ? '方案生成实时输出' : '模型实时输出'}
            </p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {progress.step === 'generating_schemes' ? '模型返回内容会持续出现在这里' : '用于确认模型仍在工作'}
            </p>
          </div>
          <pre
            ref={liveOutputRef}
            className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-slate-200"
          >
            {progress.liveOutput}
          </pre>
        </div>
      )}
      </section>
    </>
  );
}
