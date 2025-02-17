import { supabase } from '@/lib/supabase/client'
import { analyzeWord } from './word-analyzer'

interface DictionaryResponse {
  word: string
  phonetics: {
    text?: string
    audio?: string
  }[]
  meanings: {
    partOfSpeech: string
    definitions: {
      definition: string
      synonyms: string[]
      antonyms: string[]
      example?: string
    }[]
    synonyms: string[]
    antonyms: string[]
  }[]
}

interface WordEntry {
  word: string
  part_of_speech: string
  definitions: string[]
  phonetics: string | null
  synonyms: string[]
  antonyms: string[]
}

function extractPhonetics(phonetics: DictionaryResponse['phonetics']): string | null {
  // Find the first phonetic entry with a text value
  const phoneticEntry = phonetics.find(p => p.text)
  if (phoneticEntry?.text) {
    // Clean up the phonetic text (remove any extra whitespace or unwanted characters)
    return phoneticEntry.text.trim()
  }
  return null
}

export async function fetchAndFormatWord(word: string): Promise<WordEntry[]> {
  try {
    // First, check if we already have this word in our database
    const { data: existingWords, error: dbError } = await supabase
      .from('words')
      .select('*')
      .eq('word', word.toLowerCase())

    if (dbError) {
      console.error('Database error:', dbError)
      throw dbError
    }

    if (existingWords && existingWords.length > 0) {
      console.log(`⚡ "${word}" already in database with ${existingWords.length} forms`)
      return existingWords as WordEntry[]
    }

    // If not in database, fetch from API
    console.log(`🔍 Fetching "${word}" from API...`)
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`)
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`)
    }

    const data: DictionaryResponse[] = await response.json()
    
    if (!data || data.length === 0) {
      throw new Error('No data found for word')
    }

    // Format the data for our database structure, applying filters
    const formattedEntries: WordEntry[] = []
    const totalMeanings = data[0].meanings.length
    let validMeanings = 0
    
    // Group meanings by part of speech
    const meaningsByPartOfSpeech = new Map<string, {
      definitions: string[]
      synonyms: string[]
      antonyms: string[]
    }>()
    
    for (const meaning of data[0].meanings) {
      const firstDef = meaning.definitions[0]?.definition || ''
      const analysis = await analyzeWord(
        data[0].word.toLowerCase(), 
        meaning.partOfSpeech, 
        firstDef
      )
      
      if (analysis.isValid) {
        validMeanings++
        
        // Get or create entry for this part of speech
        const existing = meaningsByPartOfSpeech.get(meaning.partOfSpeech) || {
          definitions: [],
          synonyms: [],
          antonyms: []
        }
        
        // Add new definitions and synonyms/antonyms
        existing.definitions.push(...meaning.definitions.map(def => def.definition))
        existing.synonyms.push(...meaning.synonyms)
        existing.antonyms.push(...meaning.antonyms)
        
        meaningsByPartOfSpeech.set(meaning.partOfSpeech, existing)
      } else {
        console.log(`  ⨯ ${meaning.partOfSpeech}: ${analysis.reason}`)
      }
    }

    // Convert grouped meanings into entries
    for (const [partOfSpeech, meanings] of meaningsByPartOfSpeech.entries()) {
      formattedEntries.push({
        word: data[0].word.toLowerCase(),
        part_of_speech: partOfSpeech,
        definitions: [...new Set(meanings.definitions)], // Remove duplicates
        phonetics: extractPhonetics(data[0].phonetics),
        synonyms: [...new Set(meanings.synonyms)], // Remove duplicates
        antonyms: [...new Set(meanings.antonyms)] // Remove duplicates
      })
    }

    if (formattedEntries.length === 0) {
      console.log(`❌ Skipping "${word}" - no valid entries (${validMeanings}/${totalMeanings} meanings passed filters)`)
      return []
    }

    // Insert the formatted entries into our database
    console.log(`💾 Saving ${validMeanings}/${totalMeanings} meanings for "${word}"...`)
    const { error: insertError } = await supabase
      .from('words')
      .insert(formattedEntries)

    if (insertError) {
      console.error('Error inserting words:', insertError)
      throw insertError
    }

    console.log(`✅ Successfully added "${word}"`)
    return formattedEntries
  } catch (error) {
    console.error('Error fetching word:', error)
    throw error
  }
}

export async function batchFetchWords(words: string[]): Promise<void> {
  const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]
  let successCount = 0
  let skipCount = 0
  let errorCount = 0
  let totalMeanings = 0
  let validMeanings = 0
  
  for (const [index, word] of uniqueWords.entries()) {
    try {
      console.log(`\n[${index + 1}/${uniqueWords.length}] Processing "${word}"...`)
      const entries = await fetchAndFormatWord(word)
      
      if (entries.length > 0) {
        successCount++
        validMeanings += entries.length
      } else {
        skipCount++
      }
      totalMeanings += entries.length
      
      // Add a small delay to avoid rate limiting
      if (index < uniqueWords.length - 1) {
        console.log('⏳ Waiting for rate limit...')
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`❌ Error processing "${word}":`, error)
      errorCount++
      continue
    }
  }

  console.log('\n📊 Summary:')
  console.log(`✅ Successfully added: ${successCount} words`)
  console.log(`⨯ Skipped: ${skipCount} words`)
  console.log(`❌ Errors: ${errorCount} words`)
  console.log(`📝 Valid meanings: ${validMeanings}/${totalMeanings} (${Math.round(validMeanings/totalMeanings*100)}%)`)
} 