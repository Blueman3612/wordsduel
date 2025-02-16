# WordsDuel - A Real-time Word Game

## Project Overview
WordsDuel is a real-time multiplayer word game where players take turns typing words that match given parameters. The game progressively gets harder as parameters become more specific, continuing until a player fails to provide a valid word within the time limit.

### Game Flow
1. Players join a game session
2. Initial parameter is given (e.g., "Noun")
3. Players alternate turns:
   - Player types a word matching the parameter
   - Word is validated against dictionary and parameters
   - Word is checked for uniqueness against used words
   - Valid word is added to "used words" list
4. Parameters become progressively harder (e.g., "Includes letter X")
5. Game continues until a player fails to provide a valid word in time

## File Structure
```
src/
├── app/
│   ├── api/           # API routes for game logic and validation
│   ├── game/          # Game-related pages
│   └── auth/          # Authentication pages
├── components/
│   ├── game/          # Game-specific components
│   └── ui/            # Reusable UI components (Button, Input, Card)
├── lib/
│   ├── supabase/      # Supabase client and utilities
│   ├── utils/         # Helper functions and word processing
│   └── store/         # Zustand store configurations
└── types/             # TypeScript type definitions
```

## Word Processing System
### Word Validation
- Dictionary validation using Dictionary API
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
  - Validates against dictionary to catch irregular plurals
- Removes conjugated verbs:
  - Past tense (-ed)
  - Progressive (-ing)
  - Third person singular (-s, -es)
- Excludes modified adjectives:
  - Comparative (-er)
  - Superlative (-est)

## State Management (Zustand)
### Game State:
```typescript
{
  id: string
  status: 'waiting' | 'playing' | 'finished'
  players: Player[]
  currentPlayer: string
  currentParameter: {
    type: 'noun' | 'verb' | 'adjective' | 'includes' | 'starts_with' | 'ends_with'
    value?: string
    difficulty: number
  }
  usedWords: string[]
  timeLimit: number
  winner?: string
}
```

## API Endpoints
### `/api/validate`
Validates words against:
- Dictionary existence
- Parameter matching
- Word form requirements
- Previous usage

### `/api/game/start`
- Initializes new game session
- Sets initial parameter
- Assigns player order

### `/api/game/move`
- Processes player moves
- Updates game state
- Triggers parameter progression

## Database Schema
### Games
```sql
games (
  id: uuid primary key
  created_at: timestamp
  status: enum
  current_parameter: jsonb
  current_player: uuid
  winner: uuid nullable
  time_limit: integer
  used_words: text[]
)
```

### Players
```sql
players (
  id: uuid primary key
  username: text
  email: text
  stats: jsonb
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
Run `npm run seed-words` to populate the database with validated words:
- Processes words from dictionary source
- Applies validation rules
- Stores in Supabase with part of speech and definitions
- Tracks word relationships (synonyms, antonyms)
- Excludes invalid forms (plurals, conjugations, etc.)

## Deployment Instructions
1. Set up Supabase project
   - Create new project
   - Run database migrations
   - Configure authentication

2. Environment Setup
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Build and Deploy
   ```bash
   npm run build
   npm run start
   ```

4. Vercel Deployment
   - Connect repository
   - Configure environment variables
   - Deploy

## Component Hierarchy
- Layout
  - AuthProvider
    - GameProvider
      - GameGrid
        - WordInput
        - ParameterDisplay
        - Timer
        - PlayerScore
      - GameControls
      - WordHistory

## State Management (Zustand)
- Game State:
  - Current parameter
  - Used words
  - Player turns
  - Timer state
  - Game status
- User State:
  - Authentication
  - Player statistics

## API Endpoints
- `/api/game/validate` - Validate word against parameters
- `/api/game/start` - Initialize new game session
- `/api/game/move` - Process player move
- `/api/auth/*` - Authentication endpoints

## Database Schema
### Games
```sql
games (
  id: uuid primary key
  created_at: timestamp
  status: enum
  current_parameter: text
  current_player: uuid
  winner: uuid nullable
)
```

### Moves
```sql
moves (
  id: uuid primary key
  game_id: uuid foreign key
  player_id: uuid foreign key
  word: text
  parameter: text
  timestamp: timestamp
)
```

### Players
```sql
players (
  id: uuid primary key
  username: text
  email: text
  stats: jsonb
)
```

## Deployment Instructions
1. Set up Supabase project
   - Create new project
   - Run database migrations
   - Configure authentication

2. Environment Setup
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Build and Deploy
   ```bash
   npm run build
   npm run start
   ```

4. Vercel Deployment
   - Connect repository
   - Configure environment variables
   - Deploy

## Development Setup
1. Clone repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run development server: `npm run dev`
5. Access at `http://localhost:3000` 