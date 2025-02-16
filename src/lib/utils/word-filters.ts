// Common word endings that indicate plural nouns
const PLURAL_ENDINGS = ['s', 'es', 'ies']
// Common verb conjugation endings
const VERB_CONJUGATIONS = ['ing', 'ed', 's', 'es']
// Common adjective modifications
const ADJECTIVE_MODIFICATIONS = ['er', 'est']

// Import spell checker
import nspell from 'nspell'
import dictionary from 'dictionary-en'

let spellChecker: any = null

const getSpellChecker = async () => {
  if (spellChecker) return spellChecker
  spellChecker = nspell(dictionary)
  return spellChecker
}

export function isSingular(word: string): boolean {
  // Check common plural endings
  if (word.endsWith('s')) {
    // Words ending in 'ss' are usually singular
    if (word.endsWith('ss')) return true
    
    // If removing 's' creates a word ending in 'i', it's likely plural (e.g., 'fungi')
    const singular = word.slice(0, -1)
    if (singular.endsWith('i')) return false
  }

  // Check for 'ies' ending (e.g., 'cities' -> 'city')
  if (word.endsWith('ies')) {
    return false
  }

  // Most other words are considered singular
  return true
}

export function isRootWord(word: string, partOfSpeech: string): boolean {
  // For verbs
  if (partOfSpeech === 'verb') {
    return !VERB_CONJUGATIONS.some(ending => word.endsWith(ending))
  }

  // For adjectives
  if (partOfSpeech === 'adjective') {
    return !ADJECTIVE_MODIFICATIONS.some(ending => word.endsWith(ending))
  }

  // For nouns, check if it's singular
  if (partOfSpeech === 'noun') {
    return isSingular(word)
  }

  return true
}

export function isValidPartOfSpeech(partOfSpeech: string): boolean {
  const validTypes = ['noun', 'verb', 'adjective', 'adverb']
  return validTypes.includes(partOfSpeech)
}

export function isProperNoun(word: string, definition: string): boolean {
  // Check if the word starts with a capital letter
  if (word[0] === word[0].toUpperCase()) {
    return true
  }

  // Check if the definition contains indicators of a proper noun
  const properNounIndicators = [
    'brand',
    'trademark',
    'name',
    'company',
    'place',
    'country',
    'city',
    'person',
    'language'
  ]

  return properNounIndicators.some(indicator => 
    definition.toLowerCase().includes(indicator)
  )
}

export function isPresentTense(word: string, partOfSpeech: string): boolean {
  if (partOfSpeech !== 'verb') return true

  // Check for common past tense endings
  if (word.endsWith('ed')) return false
  
  // Check for progressive tense
  if (word.endsWith('ing')) return false
  
  // Check for third person singular
  if (word.endsWith('s') || word.endsWith('es')) return false

  return true
}

export function shouldIncludeWord(
  word: string,
  partOfSpeech: string,
  definition: string
): boolean {
  // Check if it's a valid part of speech first
  if (!isValidPartOfSpeech(partOfSpeech)) {
    return false
  }

  // For nouns, check if it's proper
  if (partOfSpeech === 'noun' && isProperNoun(word, definition)) {
    return false
  }

  // Check if it's a root word
  if (!isRootWord(word, partOfSpeech)) {
    return false
  }

  // For verbs, check if it's present tense
  if (!isPresentTense(word, partOfSpeech)) {
    return false
  }

  // For nouns, check if it's singular
  if (partOfSpeech === 'noun' && !isSingular(word)) {
    return false
  }

  return true
} 