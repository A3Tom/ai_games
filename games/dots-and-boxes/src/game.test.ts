import { describe, expect, it } from "vitest";

import { boxEdges, createMatch, getBoard, playMove, readMatch } from "./game";
import type { Match, Player } from "./game";

const players: Player[] = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
];

function move(match: Match, edge: number): Match {
  const result = playMove(match, match.players[getBoard(match).turn]!.id, edge);
  if ("error" in result) throw new Error(result.error);
  return result.match;
}

describe("Dots and Boxes rules", () => {
  it("starts an empty board and alternates two to four players after unscored moves", () => {
    const match = createMatch(
      3,
      [
        ...players,
        { id: "charlie", name: "Charlie" },
        { id: "dee", name: "Dee" },
      ],
      "round-1",
    );
    expect(getBoard(match)).toEqual({
      edges: Array(24).fill(-1),
      boxes: Array(9).fill(-1),
      scores: [0, 0, 0, 0],
      turn: 0,
      finished: false,
      lastEdge: null,
    });
    const after = [0, 1, 2, 3].reduce(move, match);
    expect(getBoard(after).edges.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(getBoard(after).turn).toBe(0);
    expect(match.moves).toEqual([]);
  });

  it("keeps the turn and awards a point when a player completes a box", () => {
    const match = [0, 3, 12].reduce(move, createMatch(3, players, "single"));
    const result = playMove(match, "bob", 13);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.claimed).toBe(1);
    expect(getBoard(result.match).scores).toEqual([0, 1]);
    expect(getBoard(result.match).boxes[0]).toBe(1);
    expect(getBoard(result.match).turn).toBe(1);
    expect(getBoard(move(result.match, 1)).turn).toBe(0);
  });

  it("claims both adjacent boxes with one shared edge and keeps the turn", () => {
    const match = [0, 1, 3, 4, 12, 14].reduce(
      move,
      createMatch(3, players, "double"),
    );
    const result = playMove(match, "alice", 13);
    if ("error" in result) throw new Error(result.error);
    expect(result.claimed).toBe(2);
    expect(getBoard(result.match).scores).toEqual([2, 0]);
    expect(getBoard(result.match).boxes.slice(0, 2)).toEqual([0, 0]);
    expect(getBoard(result.match).turn).toBe(0);
  });

  it("rejects wrong players, duplicate edges and invalid coordinates without changing state", () => {
    const initial = createMatch(3, players, "invalid");
    expect(playMove(initial, "bob", 0)).toHaveProperty("error");
    expect(playMove(initial, "stranger", 0)).toHaveProperty("error");
    for (const edge of [-1, 24, 0.5, NaN, Infinity])
      expect(playMove(initial, "alice", edge)).toHaveProperty("error");
    const after = move(initial, 0);
    expect(playMove(after, "bob", 0)).toHaveProperty("error");
    expect(after.moves).toEqual([0]);
    expect(initial.moves).toEqual([]);
  });

  it.each([3, 4, 5] as const)(
    "ends a board %i boxes wide only when every box has an owner",
    (size) => {
      let match = createMatch(size, players, `complete-${size}`);
      const count = 2 * size * (size + 1);
      for (let edge = 0; edge < count; edge++) {
        expect(getBoard(match).finished).toBe(false);
        match = move(match, edge);
      }
      const board = getBoard(match);
      expect(board.finished).toBe(true);
      expect(board.scores.reduce((sum, score) => sum + score, 0)).toBe(
        size * size,
      );
      expect(
        board.boxes.every((owner) => owner >= 0 && owner < players.length),
      ).toBe(true);
      expect(playMove(match, match.players[board.turn]!.id, 0)).toHaveProperty(
        "error",
      );
      expect(readMatch(match)).toEqual(match);
    },
  );

  it("preserves a tied result when players finish with the same number of boxes", () => {
    const match = Array.from({ length: 40 }, (_, edge) => edge).reduce(
      move,
      createMatch(4, players, "tie"),
    );
    expect(getBoard(match).finished).toBe(true);
    expect(getBoard(match).scores).toEqual([8, 8]);
  });

  it("maps outer and shared edges consistently", () => {
    expect(boxEdges(3, 0, 0)).toEqual([0, 3, 12, 13]);
    expect(boxEdges(3, 0, 1)).toEqual([1, 4, 13, 14]);
    expect(boxEdges(3, 2, 2)).toEqual([8, 11, 22, 23]);
    expect(() => boxEdges(3, -1, 0)).toThrow(RangeError);
    expect(() => boxEdges(3, 0, 3)).toThrow(RangeError);
  });
});

describe("Untrusted match snapshots", () => {
  it("returns defensive copies and derives state instead of trusting peer scores", () => {
    const match = createMatch(3, players, "snapshot");
    const snapshot = { ...match, scores: [999, 0], turn: 1 };
    const read = readMatch(snapshot)!;
    expect(getBoard(read).scores).toEqual([0, 0]);
    expect(getBoard(read).turn).toBe(0);
    expect(read).not.toBe(match);
    read.players[0]!.name = "Changed";
    read.moves.push(0);
    expect(match.players[0]!.name).toBe("Alice");
    expect(match.moves).toEqual([]);
  });

  it("rejects invalid identities, sizes, rosters and histories", () => {
    const valid = createMatch(3, players, "snapshot");
    const invalid: unknown[] = [
      null,
      [],
      "game",
      {},
      { ...valid, id: "" },
      { ...valid, id: "bad id" },
      { ...valid, id: "a".repeat(65) },
      { ...valid, size: 2 },
      { ...valid, size: "3" },
      { ...valid, players: [] },
      { ...valid, players: [players[0]] },
      { ...valid, players: [...players, ...players, players[0]] },
      { ...valid, players: [players[0], players[0]] },
      { ...valid, players: [players[0], { id: "x", name: "" }] },
      { ...valid, players: [players[0], { id: "x", name: " padded " }] },
      { ...valid, players: [players[0], { id: "x", name: "a".repeat(33) }] },
      { ...valid, players: [players[0], { id: "../x", name: "X" }] },
      { ...valid, moves: {} },
      { ...valid, moves: [0, 0] },
      { ...valid, moves: [-1] },
      { ...valid, moves: [24] },
      { ...valid, moves: [NaN] },
      { ...valid, moves: [0.5] },
      { ...valid, moves: ["0"] },
      { ...valid, moves: Array(25).fill(0) },
    ];
    for (const snapshot of invalid) expect(readMatch(snapshot)).toBeNull();
    expect(() => createMatch(3, [players[0]!, players[0]!], "bad")).toThrow();
  });

  it("keeps the largest legal snapshot comfortably inside the relay frame limit", () => {
    const roster = Array.from({ length: 4 }, (_, index) => ({
      id: `${index}-${"a".repeat(62)}`,
      name: "\u754c".repeat(32),
    }));
    let match = createMatch(5, roster, "m".repeat(64));
    for (let edge = 0; edge < 60; edge++) match = move(match, edge);
    const envelope = {
      type: "relay:message",
      messageId: "q".repeat(64),
      payload: { kind: "snapshot", match },
    };
    expect(
      new TextEncoder().encode(JSON.stringify(envelope)).byteLength,
    ).toBeLessThan(4096);
    expect(readMatch(match)).toEqual(match);
  });
});
