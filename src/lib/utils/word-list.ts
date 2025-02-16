import fs from 'fs'
import path from 'path'

export function getTestWords(startingLetter: string): string[] {
  try {
    // Read the english.txt file
    const wordList = fs.readFileSync(
      path.join(process.cwd(), 'english.txt'),
      'utf-8'
    )

    // Split into words and filter for words starting with the given letter
    const validWords = wordList
      .split('\n')
      .map(word => word.trim())
      .filter(word => 
        word && // not empty
        word.length >= 5 && // minimum 5 letters
        !word.includes('-') && // no hyphens
        !word.includes(' ') && // no spaces (phrases)
        /^[a-zA-Z]+$/.test(word) && // only letters
        word.toLowerCase().startsWith(startingLetter.toLowerCase()) // starts with specified letter
      )

    return validWords
  } catch (error) {
    console.error('Error reading word list:', error)
    return []
  }
} 