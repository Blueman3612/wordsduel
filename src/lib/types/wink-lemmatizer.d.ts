declare module 'wink-lemmatizer' {
  export const Verb: {
    lemmatize: (word: string) => string;
  };
  export const Noun: {
    lemmatize: (word: string) => string;
  };
  export const Adjective: {
    lemmatize: (word: string) => string;
  };
} 