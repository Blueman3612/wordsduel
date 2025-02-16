declare module 'nspell' {
  interface NSpell {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
  }

  function nspell(dictionary: { aff: Buffer; dic: Buffer }): NSpell;
  export default nspell;
}

declare module 'dictionary-en' {
  const dictionary: { aff: Buffer; dic: Buffer };
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