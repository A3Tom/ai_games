export type BoardSize = 3 | 4 | 5;

export interface Player {
  id: string;
  name: string;
}

/** A compact, replayable snapshot: turns and scores are derived from the moves. */
export interface Match {
  id: string;
  size: BoardSize;
  players: Player[];
  moves: number[];
}

export interface Board {
  edges: number[];
  boxes: number[];
  scores: number[];
  turn: number;
  finished: boolean;
  lastEdge: number | null;
}

const identifier = /^[a-zA-Z0-9_-]{1,64}$/;

function isBoardSize(value: unknown): value is BoardSize {
  return value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Top, bottom, left, right edge indices for a box. */
export function boxEdges(size: BoardSize, row: number, col: number): number[] {
  if (
    !isBoardSize(size) ||
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row >= size ||
    col < 0 ||
    col >= size
  ) {
    throw new RangeError("Box coordinates are outside the board.");
  }
  const vertical = size * (size + 1);
  return [
    row * size + col,
    (row + 1) * size + col,
    vertical + row * (size + 1) + col,
    vertical + row * (size + 1) + col + 1,
  ];
}

function emptyBoard(size: BoardSize, players: number): Board {
  return {
    edges: Array<number>(2 * size * (size + 1)).fill(-1),
    boxes: Array<number>(size * size).fill(-1),
    scores: Array<number>(players).fill(0),
    turn: 0,
    finished: false,
    lastEdge: null,
  };
}

/** Apply one already validated edge. Completing any number of boxes keeps the turn. */
function drawEdge(board: Board, size: BoardSize, edge: number): number {
  board.edges[edge] = board.turn;
  board.lastEdge = edge;
  let claimed = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const box = row * size + col;
      if (
        board.boxes[box] === -1 &&
        boxEdges(size, row, col).every((side) => board.edges[side] !== -1)
      ) {
        board.boxes[box] = board.turn;
        claimed++;
      }
    }
  }
  board.scores[board.turn] = board.scores[board.turn]! + claimed;
  board.finished = board.boxes.every((owner) => owner !== -1);
  if (!claimed && !board.finished)
    board.turn = (board.turn + 1) % board.scores.length;
  return claimed;
}

/** Read untrusted peer data, rejecting malformed or impossible move histories. */
export function readMatch(value: unknown): Match | null {
  try {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      !identifier.test(value.id) ||
      !isBoardSize(value.size) ||
      !Array.isArray(value.players) ||
      value.players.length < 2 ||
      value.players.length > 4 ||
      !Array.isArray(value.moves) ||
      value.moves.length > 2 * value.size * (value.size + 1)
    )
      return null;

    const players: Player[] = [];
    const playerIds = new Set<string>();
    for (const player of value.players) {
      if (
        !isRecord(player) ||
        typeof player.id !== "string" ||
        !identifier.test(player.id) ||
        playerIds.has(player.id) ||
        typeof player.name !== "string" ||
        !player.name.length ||
        player.name.length > 32 ||
        player.name !== player.name.trim()
      )
        return null;
      playerIds.add(player.id);
      players.push({ id: player.id, name: player.name });
    }

    const board = emptyBoard(value.size, players.length);
    const moves: number[] = [];
    for (const edge of value.moves) {
      if (
        typeof edge !== "number" ||
        !Number.isInteger(edge) ||
        edge < 0 ||
        edge >= board.edges.length ||
        board.edges[edge] !== -1 ||
        board.finished
      )
        return null;
      drawEdge(board, value.size, edge);
      moves.push(edge);
    }
    // Return a defensive, canonical copy; peer-supplied scores or turns are ignored.
    return { id: value.id, size: value.size, players, moves };
  } catch {
    return null;
  }
}

export function createMatch(
  size: BoardSize,
  players: Player[],
  id: string,
): Match {
  const match = readMatch({
    id,
    size,
    players: players.map((player) => ({ ...player, name: player.name.trim() })),
    moves: [],
  });
  if (!match)
    throw new Error(
      "A match needs a valid board and two to four distinct players.",
    );
  return match;
}

/** Reconstruct scores, edge ownership and the next turn from a valid match. */
export function getBoard(match: Match): Board {
  const board = emptyBoard(match.size, match.players.length);
  for (const edge of match.moves) drawEdge(board, match.size, edge);
  return board;
}

export function playMove(
  match: Match,
  playerId: string,
  edge: number,
): { match: Match; claimed: number } | { error: string } {
  const board = getBoard(match);
  if (board.finished)
    return { error: "This round is complete. Start a rematch to play again." };
  if (match.players[board.turn]?.id !== playerId)
    return { error: "Wait for your turn." };
  if (!Number.isInteger(edge) || edge < 0 || edge >= board.edges.length)
    return { error: "Choose an edge on the board." };
  if (board.edges[edge] !== -1)
    return { error: "That edge has already been drawn." };
  const claimed = drawEdge(board, match.size, edge);
  return { match: { ...match, moves: [...match.moves, edge] }, claimed };
}
