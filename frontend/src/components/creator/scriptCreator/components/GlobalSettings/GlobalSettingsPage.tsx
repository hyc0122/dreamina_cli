import { useEffect, useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { callAIWithFallback } from "../../services/aiService";
import { jimengApi, type CreatorModelOption } from "@/lib/jimengApi";

export default function GlobalSettingsPage() {
  const { config, setConfig } = useApp();
  const [connectionStatus, setConnectionStatus] = useState("");
  const [modelOptions, setModelOptions] = useState<CreatorModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const connected = Boolean(config.modelName.trim());

  useEffect(() => {
    let mounted = true;
    setLoadingModels(true);
    jimengApi
      .listCreatorModelOptions()
      .then((data) => {
        if (!mounted) return;
        setModelOptions(data.options);
        const defaultModel = data.default_model_id || data.options[0]?.value || "";
        const fallback1 = data.options.find((item) => item.value !== defaultModel)?.value || "";
        const fallback2 = data.options.find((item) => item.value !== defaultModel && item.value !== fallback1)?.value || "";
        setConfig({
          ...config,
          apiBaseUrl: "/jimeng/creator",
          apiKey: "",
          modelName: config.modelName.includes(":") ? config.modelName : defaultModel,
          fallbackModelName1: config.fallbackModelName1.includes(":") ? config.fallbackModelName1 : fallback1,
          fallbackModelName2: config.fallbackModelName2.includes(":") ? config.fallbackModelName2 : fallback2,
          reviewModelName: config.reviewModelName.includes(":") ? config.reviewModelName : defaultModel,
        });
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setConnectionStatus(error instanceof Error ? error.message : "读取当前大模型文本模型失败");
      })
      .finally(() => {
        if (mounted) setLoadingModels(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateModel = (modelName: string) => {
    setConfig({ ...config, apiBaseUrl: "/jimeng/creator", apiKey: "", modelName, reviewModelName: modelName });
  };

  const updateConcurrentRuns = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, "");
    const next = digitsOnly === "" ? 0 : Math.max(0, Math.min(1000, Number(digitsOnly) || 0));
    setConfig({ ...config, maxConcurrentProjectRuns: next });
  };

  const testConnection = async () => {
    if (!config.modelName.trim()) {
      setConnectionStatus("请先在当前项目的大模型设置里启用至少一个文本模型。");
      return;
    }

    setConnectionStatus("正在测试当前大模型连接...");
    try {
      const response = await callAIWithFallback(
        '只输出JSON：{"ok":true,"message":"test"}',
        120,
        0.1,
        {
          apiBaseUrl: "/jimeng/creator",
          apiKey: "",
          modelName: config.modelName,
          timeoutMs: 45000,
        },
        [config.fallbackModelName1, config.fallbackModelName2],
      );
      setConnectionStatus(response.includes("ok") ? "连接可用，后续新建项目会继承这套模型策略。" : "接口有返回，但结果结构不稳定，请切换模型再测一次。");
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : "模型连接失败");
    }
  };

  return (
    <main className="mx-auto max-w-[900px] px-6 py-8">
      <section className="rounded-3xl border border-[#1d2a3e] bg-[#0b1725]/90 p-7">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-blue-300">全局设置</p>
            <h1 className="mt-3 text-4xl font-black text-white">模型策略</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              这里保留原创作助手的首选模型、备用模型和后台并发策略；API Key 和请求地址统一使用当前项目“大模型设置”里的佳速 API。
            </p>
          </div>
          <span className={connected ? "rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300" : "rounded-full bg-slate-700/40 px-4 py-2 text-sm font-black text-slate-400"}>
            {connected ? "已选择模型" : "待选择"}
          </span>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100">
            当前模块不再保存独立 API Key。需要新增、删除或启用模型，请到当前项目顶部导航的“大模型设置”中维护。
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-300">默认模型</span>
            <select
              value={config.modelName}
              onChange={(event) => updateModel(event.target.value)}
              disabled={loadingModels}
              className="h-12 w-full rounded-xl border border-[#26354d] bg-[#07111d] px-4 text-sm font-bold text-slate-100 outline-none focus:border-blue-400"
            >
              <option value="">请选择文本模型</option>
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-300">备用模型 1</span>
              <select
                value={config.fallbackModelName1}
                onChange={(event) => setConfig({ ...config, fallbackModelName1: event.target.value })}
                disabled={loadingModels}
                className="h-12 w-full rounded-xl border border-[#26354d] bg-[#07111d] px-4 text-sm font-bold text-slate-100 outline-none focus:border-blue-400"
              >
                <option value="">不使用</option>
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-300">备用模型 2</span>
              <select
                value={config.fallbackModelName2}
                onChange={(event) => setConfig({ ...config, fallbackModelName2: event.target.value })}
                disabled={loadingModels}
                className="h-12 w-full rounded-xl border border-[#26354d] bg-[#07111d] px-4 text-sm font-bold text-slate-100 outline-none focus:border-blue-400"
              >
                <option value="">不使用</option>
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-300">后台并发项目数</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(config.maxConcurrentProjectRuns || 0)}
              onChange={(event) => updateConcurrentRuns(event.target.value)}
              className="h-12 w-full rounded-xl border border-[#26354d] bg-[#07111d] px-4 text-slate-100 outline-none focus:border-blue-400"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">填 0 表示不限制；填 3 就最多同时跑 3 个，其余排队。</p>
          </label>

          <button
            type="button"
            onClick={testConnection}
            disabled={!connected}
            className="h-12 w-full rounded-xl border border-blue-400/70 text-base font-black text-blue-300 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            测试当前模型连接
          </button>

          {connectionStatus && (
            <p className={`text-sm leading-6 ${connectionStatus.includes("失败") || connectionStatus.includes("错误") || connectionStatus.includes("超时") ? "text-red-300" : "text-emerald-300"}`}>
              {connectionStatus}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}