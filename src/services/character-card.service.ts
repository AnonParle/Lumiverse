import { inflateSync } from "zlib";
import type { CreateCharacterInput } from "../types/character";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DECOMPRESSED_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Reads PNG chunks and extracts the text value for a given keyword.
 * Handles tEXt, zTXt, and iTXt chunk types.
 */
function extractPngTextChunk(buffer: Buffer, keyword: string): string | null {
  // Verify PNG signature
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file");
  }

  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > buffer.length) break;

    if (type === "tEXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const key = data.toString("ascii", 0, nullIdx);
        if (key === keyword) {
          return data.toString("latin1", nullIdx + 1);
        }
      }
    } else if (type === "zTXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const key = data.toString("ascii", 0, nullIdx);
        if (key === keyword) {
          // byte after null is compression method (0 = deflate), then compressed data
          const compressed = data.subarray(nullIdx + 2);
          const decompressed = inflateSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_SIZE });
          return decompressed.toString("utf-8");
        }
      }
    } else if (type === "iTXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const key = data.toString("ascii", 0, nullIdx);
        if (key === keyword) {
          // iTXt: keyword\0 compression_flag(1) compression_method(1) language\0 translated_keyword\0 text
          const compressionFlag = data[nullIdx + 1];
          let pos = nullIdx + 3; // skip compression_flag + compression_method
          // skip language tag (null-terminated)
          const langEnd = data.indexOf(0, pos);
          if (langEnd === -1) break;
          pos = langEnd + 1;
          // skip translated keyword (null-terminated)
          const transEnd = data.indexOf(0, pos);
          if (transEnd === -1) break;
          pos = transEnd + 1;

          const textData = data.subarray(pos);
          if (compressionFlag === 1) {
            const decompressed = inflateSync(textData, { maxOutputLength: MAX_DECOMPRESSED_SIZE });
            return decompressed.toString("utf-8");
          }
          return textData.toString("utf-8");
        }
      }
    } else if (type === "IEND") {
      break;
    }

    // Move to next chunk: length + type(4) + data(length) + crc(4)
    offset = dataEnd + 4;
  }

  return null;
}

/**
 * Maps raw character card data (V1/V2/V3 spec) to our CreateCharacterInput.
 */
function mapCardToInput(data: Record<string, any>): CreateCharacterInput {
  const name = data.name;
  if (!name || (typeof name === "string" && name.trim() === "")) {
    throw new Error("Character card is missing required 'name' field");
  }

  const input: CreateCharacterInput = { name };

  const directFields = [
    "description", "personality", "scenario", "first_mes", "mes_example",
    "creator", "creator_notes", "system_prompt", "post_history_instructions",
  ] as const;

  for (const field of directFields) {
    if (data[field] !== undefined) {
      input[field] = String(data[field]);
    }
  }

  if (Array.isArray(data.tags)) input.tags = data.tags;
  if (Array.isArray(data.alternate_greetings)) input.alternate_greetings = data.alternate_greetings;

  const extensions: Record<string, any> = data.extensions && typeof data.extensions === "object"
    ? { ...data.extensions }
    : {};

  if (data.character_book) extensions.character_book = data.character_book;
  if (data.character_version !== undefined) extensions.character_version = data.character_version;

  if (Object.keys(extensions).length > 0) input.extensions = extensions;

  return input;
}

/**
 * Extracts character card JSON from a PNG file's tEXt/zTXt/iTXt chunk.
 * Checks for "chara" (V1/V2 standard) and "ccv3" (V3 standard) keywords.
 */
export async function extractCardFromPng(file: File): Promise<CreateCharacterInput> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const charaText = extractPngTextChunk(buffer, "chara") ?? extractPngTextChunk(buffer, "ccv3");

  if (!charaText) {
    throw new Error("PNG does not contain a character card (no 'chara' or 'ccv3' text chunk found)");
  }

  // Character cards store base64-encoded JSON in the text chunk
  const jsonStr = Buffer.from(charaText, "base64").toString("utf-8");

  let json: any;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse character card JSON from PNG text chunk");
  }

  return parseCardJson(json);
}

/**
 * Parses character card JSON — handles V1 (flat), V2, and V3 (wrapped) formats.
 */
export function parseCardJson(json: unknown): CreateCharacterInput {
  if (!json || typeof json !== "object") {
    throw new Error("Invalid character card: expected a JSON object");
  }

  const obj = json as Record<string, any>;

  // V2/V3 wrapped format
  if ((obj.spec === "chara_card_v2" || obj.spec === "chara_card_v3") && obj.data) {
    return mapCardToInput(obj.data);
  }

  // V1 flat format or plain CreateCharacterInput
  return mapCardToInput(obj);
}
