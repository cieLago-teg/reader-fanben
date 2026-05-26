import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <section className="rounded-[2rem] border border-black/5 bg-white px-7 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:px-10 md:py-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
          Reader-like English Study
        </div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
          把任何英文文章加工成接近 Reader 的精读体验
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600">
          导入网页或正文后，系统会自动做段落对齐、句子拆解、划词即查、生词沉淀和阅读进度追踪。你打开一篇文章，就应该直接进入专注阅读，而不是面对后台式工具页。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/import"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            立即导入文章
          </Link>
          <Link
            href="/library"
            className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            浏览文章库
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">工作流</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-600">
            <div>
              <div className="font-medium text-zinc-900">1. 导入文章</div>
              <div>支持 URL 抽取，也支持直接粘贴英文正文。</div>
            </div>
            <div>
              <div className="font-medium text-zinc-900">2. 沉浸阅读</div>
              <div>纯英/双语切换、段前解析入口、右侧学习侧栏同步联动。</div>
            </div>
            <div>
              <div className="font-medium text-zinc-900">3. 词句精读</div>
              <div>划词即查、朗读、生词本、句子解析卡片持续补齐。</div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-[#FBFAF6] p-6 text-sm leading-7 text-zinc-500">
          如果网页抽取失败、遇到登录墙或分段异常，直接切到“粘贴正文”会更稳。
        </div>
      </section>
    </div>
  );
}
