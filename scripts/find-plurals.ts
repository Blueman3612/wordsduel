import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface WordEntry {
  word: string
  part_of_speech: string
  definitions: string[]
}

async function findPotentialPlurals(limit: number = 10000) {
  console.log('🔍 Starting plural word detection...\n')
  let pluralsFound = 0
  let processedWords = 0
  let lastWord = ''

  try {
    let hasMore = true

    while (hasMore && pluralsFound < limit) {
      // Get next batch of words ending in 's', using pagination
      const { data: sWords, error: fetchError } = await supabase
        .from('words')
        .select('word, part_of_speech, definitions')
        .ilike('word', '%s')
        .gt('word', lastWord) // Start after the last processed word
        .order('word')
        .limit(1000)

      if (fetchError) throw fetchError
      if (!sWords || sWords.length === 0) {
        hasMore = false
        break
      }

      // Update for next iteration
      lastWord = sWords[sWords.length - 1].word
      processedWords += sWords.length

      console.log(`📊 Processing batch of ${sWords.length} words (total processed: ${processedWords})...\n`)

      for (const wordEntry of sWords) {
        if (pluralsFound >= limit) {
          hasMore = false
          break
        }

        const word = wordEntry.word
        let potentialSingular: string | null = null
        let checkType = ''

        // Determine which type of plural ending we might have
        if (word.endsWith('ies')) {
          potentialSingular = word.slice(0, -3) + 'y'
          checkType = 'ies→y'
        } else if (word.endsWith('es')) {
          potentialSingular = word.slice(0, -2)
          checkType = 'es→∅'
        } else if (word.endsWith('s')) {
          // Skip known exceptions
          const EXCEPTIONS = ['glass', 'class', 'brass', 'chess', 'cross', 'dress', 'floss', 'gloss', 'grass', 'press']
          if (EXCEPTIONS.includes(word)) {
            console.log(`⏩ Skipping known exception: "${word}"`)
            continue
          }
          potentialSingular = word.slice(0, -1)
          checkType = 's→∅'
        }

        if (!potentialSingular) continue

        // Check if the potential singular form exists
        const { data: singularData, error: singularError } = await supabase
          .from('words')
          .select('word, part_of_speech, definitions')
          .eq('word', potentialSingular)
          .eq('part_of_speech', wordEntry.part_of_speech)
          .single()

        if (singularError || !singularData) {
          continue
        }

        // Compare definitions to see if they're related
        const pluralDefs = new Set<string>(wordEntry.definitions.map((d: string) => d.toLowerCase()))
        const singularDefs = new Set<string>(singularData.definitions.map((d: string) => d.toLowerCase()))

        // Check for definition overlap
        let hasOverlap = false
        for (const def of pluralDefs.values()) {
          for (const singularDef of singularDefs.values()) {
            if (def.includes(singularDef) || singularDef.includes(def)) {
              hasOverlap = true
              break
            }
          }
          if (hasOverlap) break
        }

        if (hasOverlap) {
          pluralsFound++
          console.log(`🎯 Found potential plural #${pluralsFound}:`)
          console.log(`   Word: "${word}" (${wordEntry.part_of_speech})`)
          console.log(`   Type: ${checkType}`)
          console.log(`   Singular: "${singularData.word}" (${singularData.part_of_speech})`)
          console.log(`   Plural definitions: ${wordEntry.definitions.join(' | ')}`)
          console.log(`   Singular definitions: ${singularData.definitions.join(' | ')}`)

          // Delete the plural word from the database
          const { error: deleteError } = await supabase
            .from('words')
            .delete()
            .eq('word', word)
            .eq('part_of_speech', wordEntry.part_of_speech)

          if (deleteError) {
            console.log(`   ❌ Error deleting word: ${deleteError.message}`)
          } else {
            console.log(`   ✅ Successfully deleted plural word "${word}"`)
          }
          
          console.log()
        }
      }
    }

    console.log(`\n✅ Analysis complete!`)
    console.log(`📊 Stats:`)
    console.log(`   - Total words processed: ${processedWords}`)
    console.log(`   - Plurals found and removed: ${pluralsFound}`)

  } catch (error) {
    console.error('❌ Error during plural detection:', error)
  }
}

// Run the script
findPotentialPlurals() 