interface GameWord {
  created_at: string
  player_id: string
}

export function calculateTimeRemaining(
  words: GameWord[], 
  baseTime: number, 
  timeIncrement: number,
  player1Id: string
): { player1Time: number; player2Time: number } {
  let player1Time = baseTime;
  let player2Time = baseTime;
  
  // If no words played, return full time for both players
  if (words.length === 0) {
    return { player1Time, player2Time };
  }

  // Add increments for played words
  const player1Words = words.filter(w => w.player_id === player1Id);
  const player2Words = words.filter(w => w.player_id !== player1Id);
  player1Time += timeIncrement * player1Words.length;
  player2Time += timeIncrement * player2Words.length;

  // Process time used between moves
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i];
    const nextWord = words[i + 1];
    const timeUsed = new Date(nextWord.created_at).getTime() - new Date(currentWord.created_at).getTime();

    // Subtract time from the player whose turn it WAS
    if (currentWord.player_id === player1Id) {
      player2Time = Math.max(0, player2Time - timeUsed);
    } else {
      player1Time = Math.max(0, player1Time - timeUsed);
    }
  }

  // Calculate time since last move for current player
  const lastWord = words[words.length - 1];
  const lastMoveTime = new Date(lastWord.created_at).getTime();
  const elapsedSinceLastMove = Date.now() - lastMoveTime;

  // Subtract elapsed time from the player whose turn it currently is
  if (lastWord.player_id === player1Id) {
    player2Time = Math.max(0, player2Time - elapsedSinceLastMove);
  } else {
    player1Time = Math.max(0, player1Time - elapsedSinceLastMove);
  }

  return { player1Time, player2Time };
}

export function determineCurrentTurn(words: GameWord[], player1Id: string): number {
  if (!words || words.length === 0) {
    return 0; // Player 1's turn if no words played
  }

  // If last player was player 1, it's player 2's turn and vice versa
  return words[words.length - 1].player_id === player1Id ? 1 : 0;
}

export function setupTimerAnimation(
  words: GameWord[],
  baseTime: number,
  timeIncrement: number,
  player1Id: string,
  onTimerUpdate: (player1Time: number, player2Time: number) => void,
  onGameEnd: () => void
): () => void {
  let animationFrameId: number;

  function updateTimers() {
    const { player1Time, player2Time } = calculateTimeRemaining(words, baseTime, timeIncrement, player1Id);
    
    onTimerUpdate(player1Time, player2Time);

    // Check for game over
    if (player1Time <= 0 || player2Time <= 0) {
      onGameEnd();
      return;
    }

    animationFrameId = requestAnimationFrame(updateTimers);
  }

  // Start animation
  animationFrameId = requestAnimationFrame(updateTimers);

  // Return cleanup function
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  };
} 