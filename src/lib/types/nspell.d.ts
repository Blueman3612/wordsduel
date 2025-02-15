declare module 'nspell' {
  interface NSpell {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
  }

  function nspell(dictionary: any): NSpell;
  export default nspell;
}

declare module 'dictionary-en' {
  interface Dictionary {
    aff: Buffer;
    dic: Buffer;
  }

  function dictionary(callback: (error: Error | null, dict?: Dictionary) => void): void;
  export default dictionary;
}

declare module 'wink-lemmatizer' {
  const lemmatizer: {
    verb: (word: string) => string;
    noun: (word: string) => string;
    adjective: (word: string) => string;
  };
  export default lemmatizer;
} 