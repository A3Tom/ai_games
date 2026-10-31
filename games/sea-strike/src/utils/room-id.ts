import { customAlphabet } from 'nanoid'

const ROOM_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const ROOM_ID_LENGTH = 8

const nanoid = customAlphabet(ROOM_ID_ALPHABET, ROOM_ID_LENGTH)

/** Generates an 8-character room ID using nanoid with lowercase alphanumeric alphabet */
export function generateRoomId(): string {
  return nanoid()
}
