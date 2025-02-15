import { GameParameter } from '@/types/game'

interface DictionaryResponse {
  word: string
  meanings: {
    partOfSpeech: string
    definitions: {
      definition: string
    }[]
  }[]
}

export async function validateWord(word: string, parameter: GameParameter): Promise<boolean> {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
    
    if (!response.ok) {
      return false // Word doesn't exist
    }

    const data: DictionaryResponse[] = await response.json()
    
    if (!data || data.length === 0) {
      return false
    }

    // Check if the word matches the parameter
    switch (parameter.type) {
      case 'noun':
        return data.some(entry => 
          entry.meanings.some(meaning => 
            meaning.partOfSpeech === 'noun'
          )
        )
      
      case 'verb':
        return data.some(entry => 
          entry.meanings.some(meaning => 
            meaning.partOfSpeech === 'verb'
          )
        )
      
      case 'adjective':
        return data.some(entry => 
          entry.meanings.some(meaning => 
            meaning.partOfSpeech === 'adjective'
          )
        )
      
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