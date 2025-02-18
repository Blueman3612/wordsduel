/**
 * Calculates the Levenshtein distance between two strings
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

interface ScoringFactors {
  wordLength: number        // Length of the current word
  levenDistance: number     // Levenshtein distance from previous word
  uniqueLetters: number     // Number of unique letters in the word
  previousWordLength: number // Length of the previous word
}

/**
 * Calculate word score based on various factors
 * 
 * The scoring formula rewards:
 * 1. Longer words (quadratic scaling)
 * 2. More unique letters (linear scaling)
 * 3. Higher Levenshtein distance from previous word (exponential scaling)
 */
export function calculateWordScore(factors: ScoringFactors): number {
  const {
    wordLength,
    levenDistance,
    uniqueLetters,
    previousWordLength
  } = factors

  // Base score from word length (quadratic scaling)
  const lengthScore = Math.pow(wordLength, 2) * 10

  // Bonus for unique letters (linear scaling)
  const uniqueLetterBonus = uniqueLetters * 15

  // Bonus for Levenshtein distance (exponential scaling)
  // Normalized by the length of the longer word to make it relative
  const maxPossibleDistance = Math.max(wordLength, previousWordLength)
  const normalizedLevenDistance = levenDistance / maxPossibleDistance
  const levenBonus = Math.exp(normalizedLevenDistance * 2) * 50

  // Combine all factors
  const totalScore = lengthScore + uniqueLetterBonus + levenBonus

  // Round to nearest integer
  return Math.round(totalScore)
}

/**
 * Helper function to count unique letters in a word
 */
export function countUniqueLetters(word: string): number {
  return new Set(word.toLowerCase()).size
}

/**
 * Calculate the complete score for a played word
 */
export function scoreWord(currentWord: string, previousWord: string): number {
  const levenDistance = calculateLevenshteinDistance(currentWord, previousWord)
  
  const factors: ScoringFactors = {
    wordLength: currentWord.length,
    levenDistance,
    uniqueLetters: countUniqueLetters(currentWord),
    previousWordLength: previousWord.length
  }

  return calculateWordScore(factors)
} 