import 'dotenv/config'
import { batchFetchWords } from '../src/lib/utils/word-fetcher'
import { getTestWords } from '../src/lib/utils/word-list'

const LETTER = 'd' // Change this to process different letters
console.log(`Starting word seeding process for words beginning with '${LETTER}'...`)

const testWords = getTestWords(LETTER)
console.log(`Found ${testWords.length} words starting with '${LETTER}':`)
console.log(testWords.join(', '))
console.log('\nProcessing words...\n')

batchFetchWords(testWords)
  .then(() => {
    console.log('\nWord processing complete!')
  })
  .catch((error) => {
    console.error('Error seeding words:', error)
    process.exit(1)
  })