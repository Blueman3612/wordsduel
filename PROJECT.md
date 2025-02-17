# WordsDuel - A Real-time Word Game

## Project Overview
WordsDuel is a real-time multiplayer word game where players take turns typing words that match given parameters. The game features a beautiful, modern UI with smooth animations, expandable word cards, and real-time validation against a Supabase dictionary.

### Game Flow
1. Players join a game session
2. Initial parameter is given (e.g., "Noun")
3. Players alternate turns:
   - Player types a word matching the parameter
   - Word is validated against Supabase dictionary
   - Word is checked for uniqueness against used words
   - Valid word is added to the word chain with dictionary information
   - Invalid words are marked and displayed with a strike-through
4. Players can report words they believe are invalid
5. Game continues until a player fails to provide a valid word

## File Structure
```
src/
├── app/
│   ├── api/           # API routes for game logic and validation
│   │   └── validate/  # Word validation endpoint
│   ├── game/          # Game page and components
│   └── layout.tsx     # Root layout with global styles
├── components/
│   ├── game/          # Game-specific components (ReportModal)
│   └── ui/            # Reusable UI components (Button, Input, Card, Modal)
├── lib/
│   ├── supabase/      # Supabase client configuration
│   ├── utils/         # Helper functions
│   │   ├── word-filters.ts    # Word validation rules
│   │   ├── word-analyzer.ts   # Word analysis utilities
│   │   ├── dictionary.ts      # Dictionary operations
│   │   └── parameters.ts      # Game parameter generation
│   ├── store/         # Game state management (Zustand)
│   └── types/         # TypeScript type definitions
```

## Word Processing System
### Word Validation
- Dictionary validation using Supabase database
- Part of speech validation (nouns, verbs, adjectives, adverbs)
- Word form validation:
  - Nouns: Must be singular form
  - Verbs: Must be infinitive form
  - Adjectives: Must be base form (no comparative/superlative)
  - Proper nouns are excluded

### Word Filtering
- Removes initialisms, acronyms, and abbreviations
- Filters out plural forms:
  - Words ending in 's' (with exceptions like 'glass', 'bass')
  - Words ending in 'es' or 'ies'
  - Uses spell checker to validate singular forms
- Removes conjugated verbs:
  - Past tense (-ed)
  - Progressive (-ing)
  - Third person singular (-s, -es)
- Excludes modified adjectives:
  - Comparative (-er)
  - Superlative (-est)

## UI Components
### Game Interface
- Responsive layout with sidebar and main content area
- Word chain display with expandable word cards
- Visual feedback for valid/invalid words
- Letter grid showing available/banned letters
- Player profiles with ELO ratings

### Word Cards
- Expandable on hover for additional information
- Shows word definition, part of speech, and phonetics
- Color-coded borders for different players
- Report functionality for questionable words
- Smart positioning (left/right expansion) based on screen space

### Report Modal
- Multiple report reason options
- Additional context input
- Clean, modern design with backdrop blur

## State Management
### Game State
```typescript
{
  word: string                    // Current input word
  words: WordCard[]              // Chain of played words
  expandDirection: 'left'|'right' // Card expansion direction
  reportedWord: string           // Currently reported word
}
```

### Word Card Interface
```typescript
{
  word: string
  player: string
  timestamp: number
  isInvalid?: boolean
  dictionary?: {
    partOfSpeech?: string
    definition?: string
    phonetics?: string
  }
}
```

## API Endpoints
### `/api/validate`
Validates words against:
- Supabase dictionary existence
- Part of speech requirements
- Word form validation
- Previous usage

## Database Schema
### Words Table
```sql
words (
  word: text primary key
  part_of_speech: text
  definitions: text[]
  phonetics: text
  synonyms: text[]
  antonyms: text[]
)
```

## Development Setup
1. Clone repository
2. Install dependencies: `npm install`
3. Set up environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Run development server: `npm run dev`
5. Access at `http://localhost:3000`

## Word Seeding
Run `npm run seed-words` to populate the Supabase database:
- Processes words from dictionary source
- Applies validation rules
- Stores in Supabase with part of speech and definitions
- Tracks word relationships (synonyms, antonyms)
- Excludes invalid forms (plurals, conjugations, etc.)

## Deployment
1. Set up Supabase project
2. Configure environment variables
3. Deploy to Vercel:
   ```bash
   npm run build
   npm run start
   ```

## Technologies Used
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Supabase
- Zustand for state management
- Compromise for word analysis
- nspell for spell checking 