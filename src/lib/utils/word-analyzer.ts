import nlp from 'compromise'
import winkLemmatizer from 'wink-lemmatizer'
import nspell from 'nspell'
import dictionary from 'dictionary-en'

interface WordAnalysis {
  isValid: boolean
  reason?: string
}

let spellChecker: ReturnType<typeof nspell> | null = null

const getSpellChecker = async () => {
  if (spellChecker) return spellChecker
  spellChecker = nspell(dictionary)
  return spellChecker
}

export async function analyzeWord(word: string, partOfSpeech: string, definition: string): Promise<WordAnalysis> {
  // Convert word to lowercase for consistency
  word = word.toLowerCase().trim()
  
  // Basic validation
  if (!word || word.includes(' ')) {
    return {
      isValid: false,
      reason: 'Word is empty or contains spaces'
    }
  }

  // Check for initialisms/acronyms in definition
  if (definition.toLowerCase().startsWith('initialism') || 
      definition.toLowerCase().startsWith('acronym') ||
      definition.toLowerCase().startsWith('abbreviation')) {
    return {
      isValid: false,
      reason: 'Word is an initialism, acronym, or abbreviation'
    }
  }

  // Get spell checker suggestions if the word isn't recognized
  const spell = await getSpellChecker()
  if (!spell.correct(word)) {
    // Don't immediately reject - just log suggestions if available
    const suggestions = spell.suggest(word).slice(0, 3)
    console.log(`Note: Word "${word}" not in standard dictionary${suggestions.length ? ` (similar words: ${suggestions.join(', ')})` : ''}`)
  }

  // Use compromise to analyze the word
  const doc = nlp(word)
  
  switch (partOfSpeech) {
    case 'verb': {
      // Get the infinitive form using wink-lemmatizer
      const infinitive = winkLemmatizer.verb(word)
      
      // If the word is not equal to its infinitive form, it's not a root verb
      if (word !== infinitive) {
        return {
          isValid: false,
          reason: `Not an infinitive verb (root form is "${infinitive}")`
        }
      }
      
      // Trust the API's part of speech if compromise fails
      if (!doc.verbs().length) {
        console.log(`Note: Compromise failed to recognize "${word}" as a verb, but trusting API classification`)
      }
      
      break
    }
    
    case 'noun': {
      // Get the singular form using wink-lemmatizer
      const singular = winkLemmatizer.noun(word)
      
      // If the word is not equal to its singular form, it's not singular
      if (word !== singular) {
        return {
          isValid: false,
          reason: `Not singular (singular form is "${singular}")`
        }
      }

      // Additional checks for plural forms
      if (word.endsWith('s')) {
        // Exception for words that naturally end in 's' like 'glass'
        const EXCEPTIONS = ['glass', 'class', 'brass', 'chess', 'cross', 'dress', 'floss', 'gloss', 'grass', 'press']
        if (!EXCEPTIONS.includes(word)) {
          // Check if removing 's' creates a valid word
          const withoutS = word.slice(0, -1)
          if (spell.correct(withoutS)) {
            return {
              isValid: false,
              reason: `🔍 Likely plural (removing 's' creates valid word "${withoutS}")`
            }
          }
        }
      }

      // Check for 'es' ending
      if (word.endsWith('es')) {
        const withoutEs = word.slice(0, -2)
        if (spell.correct(withoutEs)) {
          return {
            isValid: false,
            reason: `🔍 Likely plural (removing 'es' creates valid word "${withoutEs}")`
          }
        }
      }

      // Check for 'ies' ending
      if (word.endsWith('ies')) {
        const withY = word.slice(0, -3) + 'y'
        if (spell.correct(withY)) {
          return {
            isValid: false,
            reason: `🔍 Likely plural (replacing 'ies' with 'y' creates valid word "${withY}")`
          }
        }
      }
      
      // Trust the API's part of speech if compromise fails
      if (!doc.nouns().length) {
        console.log(`Note: Compromise failed to recognize "${word}" as a noun, but trusting API classification`)
      }
      
      break
    }
    
    case 'adjective': {
      // Compromise can help identify comparative and superlative forms
      const terms = doc.adjectives()
      
      if (!terms.length) {
        console.log(`Note: Compromise failed to recognize "${word}" as an adjective, but trusting API classification`)
      } else {
        // Only check comparative/superlative if compromise recognized it
        const text = terms.text()
        const comparative = terms.toComparative().text()
        const superlative = terms.toSuperlative().text()
        
        if (text === comparative || text === superlative) {
          return {
            isValid: false,
            reason: 'Comparative or superlative form'
          }
        }
      }
      
      break
    }

    case 'adverb': {
      // No special validation for adverbs, just accept them
      break
    }
    
    default:
      return {
        isValid: false,
        reason: `Invalid part of speech: ${partOfSpeech}`
      }
  }
  
  return { isValid: true }
} 