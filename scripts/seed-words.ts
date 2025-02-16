import 'dotenv/config'
import { batchFetchWords } from '../src/lib/utils/word-fetcher'
import { getTestWords } from '../src/lib/utils/word-list'

// Process words from G to Z
const LETTERS = 'ghijklmnopqrstuvwxyz'.split('')

async function processLetter(letter: string) {
  console.log(`\n=== Starting word seeding process for words beginning with '${letter.toUpperCase()}' ===`)

  const testWords = getTestWords(letter)
  console.log(`Found ${testWords.length} words starting with '${letter}':`)
  console.log(testWords.join(', '))
  console.log('\nProcessing words...\n')

  try {
    await batchFetchWords(testWords)
    console.log(`\n✅ Word processing complete for letter '${letter.toUpperCase()}'!`)
  } catch (error) {
    console.error(`\n❌ Error seeding words for letter '${letter.toUpperCase()}':`, error)
    throw error
  }
}

async function processAllLetters() {
  for (const letter of LETTERS) {
    try {
      await processLetter(letter)
      // Add a longer delay between letters to avoid rate limiting
      console.log('\n⏳ Waiting before processing next letter...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error('\n❌ Stopping process due to error.')
      process.exit(1)
    }
  }
  console.log('\n🎉 All letters processed successfully!')
}

processAllLetters()