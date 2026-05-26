import { TranslateParams, TranslateProvider } from "../types";

export class MockTranslateProvider implements TranslateProvider {
  name = "mock";

  async translateParagraph(text: string, _params: TranslateParams): Promise<string> {
    void _params;
    // MVP：没有配置翻译服务时，用占位符，保证流程可跑通。
    return `（未配置翻译服务）${text}`;
  }
}
