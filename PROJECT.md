# Logobout - A Real-time Word Game

## Project Overview
Logobout is a real-time multiplayer word game where players take turns typing words that match given parameters. The game features a beautiful, modern UI with smooth page transitions, expandable word cards, real-time validation against a Supabase dictionary, and a dynamic letter grid system.

### Game Flow
1. Players sign in (via GitHub or email/username)
2. Players can:
   - Create a lobby (public or password-protected)
   - Join an existing lobby
   - Quick play to auto-join/create a lobby
3. Initial parameters are displayed (e.g., "at least 5 letters long", "singular non-proper noun")
4. Players alternate turns:
   - Player types a word matching all parameters
   - Word is validated against Supabase dictionary
   - Word is checked for banned letters
   - Valid word is added to the word chain with dictionary information
   - Invalid words are marked and displayed with a strike-through
5. Players can report words they believe are invalid
6. Game continues until win condition is met

## Features

### Authentication System
- GitHub OAuth integration
- Email/Password authentication
- Username/Email login support
- Remember me functionality
- Profile management with:
  - Display names
  - Customizable avatars (stored in Supabase Storage)
  - ELO rating system

### Lobby System
- Create public or password-protected lobbies
- Join existing lobbies with password support
- Quick play matchmaking
- Real-time lobby updates
- Lobby member management
- Host controls
- Maximum player limits

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
- Profile pictures with fallback initials
- Real-time presence indicators

## File Structure
```
src/
├── app/
│   ├── game/
│   │   └── [lobbyId]/
│   │       └── page.tsx    # Game interface
│   │   └── page.tsx        # Home/landing page
│   └── layout.tsx          # Root layout
├── components/
│   ├── game/
│   │   └── ActionModal.tsx # Report/Challenge modal
│   ├── layout/
│   │   ├── AnimatedLayout.tsx  # Page animation wrapper
│   │   ├── Background.tsx      # Static gradient background
│   │   ├── PageTransition.tsx  # Page transition animations
│   │   └── VisibilityHandler.tsx # Tab visibility manager
│   └── ui/
│       ├── Button.tsx      # Custom button component
│       ├── Input.tsx       # Form input component
│       └── Card.tsx        # Base card component
├── lib/
│   ├── context/
│   │   ├── auth.tsx        # Authentication context
│   │   ├── toast.tsx       # Toast notification context
│   │   └── navigation.tsx  # Navigation state context
│   ├── supabase/
│   │   └── client.ts       # Supabase client configuration
│   └── config.ts           # Application configuration
```

## Database Schema
### Tables
- profiles
  - id (uuid, primary key)
  - email (text)
  - display_name (text)
  - avatar_url (text, nullable)
  - created_at (timestamp)

- lobbies
  - id (uuid, primary key)
  - name (text)
  - host_id (uuid, foreign key to profiles)
  - status (enum: waiting, in_progress, completed)
  - max_players (integer)
  - password (text, nullable)
  - created_at (timestamp)
  - game_config (jsonb)

- lobby_members
  - lobby_id (uuid, foreign key to lobbies)
  - user_id (uuid, foreign key to profiles)
  - created_at (timestamp)

- words
  - word (text, primary key)
  - part_of_speech (text)
  - definitions (text[])
  - phonetics (text)

### Storage Buckets
- avatars
  - Public bucket for user profile pictures
  - File size limit: 5MB
  - Allowed types: image/png, image/jpeg, image/gif

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
- Supabase (Auth, Database, Storage, Realtime)
- Lucide Icons 