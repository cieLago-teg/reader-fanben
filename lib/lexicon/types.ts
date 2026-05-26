export type LexiconSense = {
  partOfSpeech?: string;
  definitions: string[];
};

export type LexiconPronunciation = {
  text?: string;
  audioUrl?: string;
};

export type LexiconCoreMeaning = {
  partOfSpeech?: string;
  gloss: string;
};

export type LexiconResult = {
  word: string;
  headword: string;
  lemma?: string;
  phonetic?: string;
  pronunciation?: LexiconPronunciation;
  coreMeaning: LexiconCoreMeaning;
  senses: LexiconSense[];
  examples?: string[];
  provider: string;
  morphology?: {
    note: string;
    affixes: string[];
  };
  mnemonic?: string;
  related?: string[];
};
