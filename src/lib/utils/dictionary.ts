import { GameParameter } from '@/types/game'
import { supabase } from '@/lib/supabase/client'

export async function validateWord(word: string, parameter: GameParameter): Promise<boolean> {
  try {
    // First check if word exists in Supabase
    const { data: existingWord, error } = await supabase
      .from('words')
      .select('part_of_speech')
      .eq('word', word.toLowerCase())
      .maybeSingle()

    if (error) {
      console.error('Error checking word in Supabase:', error)
      return false
    }

    // If word doesn't exist in our database, reject it
    if (!existingWord) {
      return false
    }

    // For part of speech parameters, check if the word has that part of speech in our database
    switch (parameter.type) {
      case 'noun':
      case 'verb':
      case 'adjective':
        return existingWord.part_of_speech === parameter.type
      
      case 'includes':
        return parameter.value ? word.includes(parameter.value) : true
      
      case 'starts_with':
        return parameter.value ? word.startsWith(parameter.value) : true
      
      case 'ends_with':
        return parameter.value ? word.endsWith(parameter.value) : true
      
      default:
        return false
    }
  } catch (error) {
    console.error('Error validating word:', error)
    return false
  }
} 