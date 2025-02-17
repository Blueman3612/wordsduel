# Logobout - A Real-time Word Game

## Project Overview
Logobout is a real-time multiplayer word game where players take turns typing words that match given parameters. The game features a beautiful, modern UI with smooth page transitions, expandable word cards, real-time validation against a Supabase dictionary, and a dynamic letter grid system.

### Game Flow
1. Players sign in (via GitHub or email)
2. Initial parameters are displayed (e.g., "at least 5 letters long", "singular non-proper noun")
3. Players alternate turns:
   - Player types a word matching all parameters
   - Word is validated against Supabase dictionary
   - Word is checked for banned letters (Q, X, Z)
   - Valid word is added to the word chain with dictionary information
   - Invalid words are marked and displayed with a strike-through
4. Players can report words they believe are invalid
5. Players can eliminate letters by playing antonyms
6. Game continues until a player fails to provide a valid word

## Features

### Authentication System
- GitHub OAuth integration
- Email/Password authentication
- Username/Email login support
- Remember me functionality
- Profile management with display names
- ELO rating system

### Game Mechanics
- Real-time word validation
- Letter elimination system
- Banned letters with visual feedback
- Word chain visualization
- Expandable word cards with definitions
- Report system for invalid words
- Parameter-based word requirements
- Antonym-based letter elimination

### UI/UX Features
- Smooth page transitions with directional animations
- Static gradient background
- Dynamic letter grid with visual feedback
- Expandable word cards with smart positioning
- Toast notification system
- Responsive modals with backdrop blur
- Custom scrollbar styling
- Modern gradient buttons with hover effects

## File Structure
```
src/
├── app/
│   ├── api/           # API routes for game logic
│   │   └── validate/  # Word validation endpoint
│   ├── game/          # Game page and components
│   └── layout.tsx     # Root layout with animations
├── components/
│   ├── game/          # Game-specific components
│   │   ├── ActionModal.tsx   # Report/Challenge modal
│   │   └── GameGrid.tsx      # Main game interface
│   ├── layout/        # Layout components
│   │   ├── Background.tsx    # Static gradient background
│   │   └── PageTransition.tsx # Page transition animations
│   └── ui/            # Reusable UI components
│       ├── Button.tsx        # Custom button component
│       ├── Input.tsx         # Form input component
│       ├── Modal.tsx         # Base modal component
│       └── Toast.tsx         # Notification component
├── lib/
│   ├── context/       # React context providers
│   │   ├── auth.tsx          # Authentication context
│   │   └── toast.tsx         # Toast notification context
│   ├── supabase/      # Supabase client configuration
│   ├── utils/         # Helper functions
│   │   ├── word-filters.ts   # Word validation rules
│   │   ├── word-analyzer.ts  # Word analysis utilities
│   │   ├── dictionary.ts     # Dictionary operations
│   │   └── parameters.ts     # Game parameter generation
│   └── types/         # TypeScript type definitions
```

## Word Processing System
### Word Validation
- Dictionary validation using Supabase database
- Part of speech validation (nouns, verbs, adjectives, adverbs)
- Word form validation:
  - Nouns: Must be singular form
  - Verbs: Must be infinitive form
  - Adjectives: Must be base form
  - Proper nouns are excluded
- Banned letter validation (Q, X, Z)

### Word Filtering
- Removes initialisms, acronyms, and abbreviations
- Filters out plural forms
- Removes conjugated verbs
- Excludes modified adjectives
- Validates against banned letters

## UI Components
### Game Interface
- Responsive layout with fixed sidebar
- Dynamic letter grid with banned letter highlighting
- Word chain display with expandable cards
- Visual feedback for valid/invalid words
- Player profiles with ELO ratings
- Smooth page transitions

### Word Cards
- Expandable on hover for additional information
- Smart positioning (left/right expansion)
- Shows word definition and phonetics
- Color-coded borders for different players
- Report functionality
- Arrow connections between words

### Authentication UI
- GitHub integration
- Email/Password registration
- Username/Email login
- Remember me option
- Profile editing
- ELO display

## State Management
### Game State
```typescript
{
  word: string                    // Current input word
  words: WordCard[]              // Chain of played words
  expandDirection: 'left'|'right' // Card expansion direction
  reportedWord: string           // Currently reported word
  invalidLetters: string[]       // Currently invalid letters
  bannedLetters: string[]        // Permanently banned letters
}
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

## Technologies Used
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Supabase
- Compromise (NLP)
- nspell (Spell checking) 