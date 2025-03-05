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
  // If no words played, return full time for both players
  if (words.length === 0) {
    return { 
      player1Time: baseTime,
      player2Time: baseTime 
    };
  }

  // Calculate increments for each player
  const player1Words = words.filter(w => w.player_id === player1Id);
  const player2Words = words.filter(w => w.player_id !== player1Id);
  const player1Increment = timeIncrement * player1Words.length;
  const player2Increment = timeIncrement * player2Words.length;

  // Initialize timers with base time + increments
  let player1Time = baseTime + player1Increment;
  let player2Time = baseTime + player2Increment;

  // Calculate elapsed time for each player's turns
  for (let i = 1; i < words.length; i++) {
    const prevWord = words[i - 1];
    const currentWord = words[i];
    const elapsedTime = new Date(currentWord.created_at).getTime() - new Date(prevWord.created_at).getTime();

    // Subtract elapsed time from the player whose turn it was
    if (prevWord.player_id === player1Id) {
      player2Time = Math.max(0, player2Time - elapsedTime);
    } else {
      player1Time = Math.max(0, player1Time - elapsedTime);
    }
  }

  // Get the last word played to determine whose timer should be counting down
  const lastWord = words[words.length - 1];
  const lastWordTime = new Date(lastWord.created_at).getTime();
  const currentTime = Date.now();
  const currentElapsedTime = currentTime - lastWordTime;

  // If player 1 played last, it's player 2's turn (their timer should be counting down)
  // If player 2 played last, it's player 1's turn (their timer should be counting down)
  if (lastWord.player_id === player1Id) {
    // Player 1 played last, so player 2's timer should be counting down
    player2Time = Math.max(0, player2Time - currentElapsedTime);
  } else {
    // Player 2 played last, so player 1's timer should be counting down
    player1Time = Math.max(0, player1Time - currentElapsedTime);
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