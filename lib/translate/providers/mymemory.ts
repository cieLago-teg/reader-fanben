import { TranslateParams, TranslateProvider } from "../types";

type MyMemoryResponse = {
  responseData?: { translatedText?: string };
};

export class MyMemoryTranslateProvider implements TranslateProvider {
  name = "mymemory";

  async translateParagraph(text: string, _params: TranslateParams): Promise<string> {
    void _params;
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", "en|zh-CN");

    const res = await fetch(url.toString(), {
      headers: { "user-agent": "FanbenReader/0.1" },
    });
    if (!res.ok) throw new Error(`翻译失败：HTTP ${res.status}`);
    const json: unknown = await res.json();
    const translated = (json as MyMemoryResponse | null)?.responseData?.translatedText;
    if (!translated || typeof translated !== "string") {
      throw new Error("翻译失败：未返回译文");
    }
    return translated;
  }
}
