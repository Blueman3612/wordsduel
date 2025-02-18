/**
 * Scoring Configuration
 * All weights can be adjusted to modify the scoring balance
 */
const SCORING_WEIGHTS = {
  // Base word length scoring
  LENGTH: {
    MULTIPLIER: 1,     // Base points per letter
    EXPONENT: 1,        // Power to raise length to (2 = quadratic scaling)
  },
  
  // Levenshtein distance (word difference) bonus
  LEVENSHTEIN: {
    BASE_POINTS: 1.5,    // Base points for maximum difference
    EXPONENT: 2,        // How quickly the bonus scales with difference (higher = more reward for different words)
  },
  
  // Letter rarity bonus
  RARITY: {
    MULTIPLIER: 0.00003,     // How much to multiply the final rarity score by
    EXPONENT: 5,        // Power to raise rarity to (higher = more reward for rare letters)
    LETTER_WEIGHTS: {   // Individual letter weights based on English frequency
      A: 7.8,  B: 2.0,  C: 4.0,  D: 3.8,  E: 11.0, F: 1.4,
      G: 3.0,  H: 2.3,  I: 8.6,  J: 0.21, K: 0.97, L: 5.3,
      M: 2.7,  N: 7.2,  O: 6.1,  P: 2.8,  Q: 0.19, R: 7.3,
      S: 8.7,  T: 6.7,  U: 3.3,  V: 1.0,  W: 0.91, X: 0.27,
      Y: 1.6,  Z: 0.44
    } as const
  }
} as const

type LetterRarity = typeof SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS
type Letter = keyof LetterRarity

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
  wordLength: number
  levenDistance: number
  previousWordLength: number
  rarityBonus: number
  isFirstWord: boolean
}

/**
 * Calculate word score based on various factors
 * 
 * Scoring Components:
 * 1. Word Length: (length ^ EXPONENT) * LENGTH.MULTIPLIER
 *    - Rewards longer words with exponential scaling
 * 
 * 2. Levenshtein Distance: exp(normalizedDistance * LEVENSHTEIN.EXPONENT) * LEVENSHTEIN.BASE_POINTS
 *    - Rewards words that are more different from the previous word
 *    - Normalized by the length of the longer word
 *    - Only applies if not the first word
 * 
 * 3. Letter Rarity: sum((12 - letterFrequency)^EXPONENT) * RARITY.MULTIPLIER
 *    - Rewards using rare letters with exponential scaling
 *    - 12 - frequency gives higher scores to rarer letters
 *    - Exponential scaling makes rare letters much more valuable
 */
export function calculateWordScore(factors: ScoringFactors): number {
  const {
    wordLength,
    levenDistance,
    previousWordLength,
    rarityBonus,
    isFirstWord
  } = factors

  // Length score (exponential scaling)
  const lengthScore = Math.round(
    Math.pow(wordLength, SCORING_WEIGHTS.LENGTH.EXPONENT) * 
    SCORING_WEIGHTS.LENGTH.MULTIPLIER
  )

  // Levenshtein distance bonus (exponential scaling)
  let levenBonus = 0
  if (!isFirstWord) {
    const maxPossibleDistance = Math.max(wordLength, previousWordLength)
    const normalizedLevenDistance = levenDistance / maxPossibleDistance
    levenBonus = Math.round(
      Math.exp(normalizedLevenDistance * SCORING_WEIGHTS.LEVENSHTEIN.EXPONENT) * 
      SCORING_WEIGHTS.LEVENSHTEIN.BASE_POINTS
    )
  }

  // Letter rarity bonus (exponential scaling)
  const rarityScore = Math.round(rarityBonus * SCORING_WEIGHTS.RARITY.MULTIPLIER)

  return lengthScore + levenBonus + rarityScore
}

/**
 * Calculate the complete score for a played word
 */
export function scoreWord(currentWord: string, previousWord: string | null): number {
  const levenDistance = previousWord ? calculateLevenshteinDistance(currentWord, previousWord) : 0
  
  // Calculate rarity bonus with exponential scaling
  const rarityBonus = currentWord.toUpperCase().split('')
    .reduce((sum, letter) => {
      const frequency = SCORING_WEIGHTS.RARITY.LETTER_WEIGHTS[letter as Letter] || 5
      // Apply exponential scaling to the rarity value
      return sum + Math.pow(12 - frequency, SCORING_WEIGHTS.RARITY.EXPONENT)
    }, 0)
  
  const factors: ScoringFactors = {
    wordLength: currentWord.length,
    levenDistance,
    previousWordLength: previousWord?.length || 0,
    rarityBonus,
    isFirstWord: !previousWord
  }

  return calculateWordScore(factors)
}

// Export scoring weights for reference
export { SCORING_WEIGHTS } 