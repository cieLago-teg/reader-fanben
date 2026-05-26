export type TranslateParams = {
  from: "en";
  to: "zh-CN";
};

export type TranslateResult = {
  zhText: string;
  provider: string;
};

export interface TranslateProvider {
  name: string;
  translateParagraph(text: string, params: TranslateParams): Promise<string>;
}

