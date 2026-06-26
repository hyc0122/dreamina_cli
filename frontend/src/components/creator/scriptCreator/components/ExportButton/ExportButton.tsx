import { useApp } from '../../contexts/AppContext';
import { buildFinalMarkdown, buildFinalPlainText } from '../../utils/finalOutput';

export default function ExportButton() {
  const { config, generatedScript, episodes, finalEpisodes, activeProject, exportProject } = useApp();

  if (!generatedScript) return null;

  const content = buildFinalPlainText(config, finalEpisodes, episodes, generatedScript);
  const safeTitle = generatedScript.title.replace(/[^\w\u4e00-\u9fa5]/g, '_');

  const handleExportTxt = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const markdown = buildFinalMarkdown(generatedScript.title, config, finalEpisodes, episodes, generatedScript);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    window.alert('成品内容已复制到剪贴板');
  };

  return (
    <section className="rounded-2xl border border-[#1d2a3e] bg-[#0a1421]/90 p-6">
      <h3 className="mb-4 text-xl font-black text-white">导出成品</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={handleExportTxt} disabled={!content.trim()} className="rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
          导出 TXT
        </button>
        <button onClick={handleExportMarkdown} disabled={!content.trim()} className="rounded-xl border border-blue-400/70 px-6 py-3 font-black text-blue-300 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50">
          导出 MD
        </button>
        <button onClick={handleCopy} disabled={!content.trim()} className="rounded-xl border border-emerald-400/70 px-6 py-3 font-black text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50">
          复制成品
        </button>
        {activeProject && (
          <button onClick={() => exportProject(activeProject.id)} className="rounded-xl border border-[#2a3b55] px-6 py-3 font-black text-slate-200 hover:border-slate-500">
            备份项目 JSON
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        TXT/MD 只导出最终可用内容；项目 JSON 保留创作过程和版本信息。
      </p>
    </section>
  );
}
