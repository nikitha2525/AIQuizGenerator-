/**
 * Cortex Content Pipeline
 * 
 * Handles extraction, cleaning, chunking, and analysis of study material.
 * Supports topic input and file uploads (PDF, TXT).
 */

import { readFileSync } from 'fs';

// ============================================================
// Text Extraction
// ============================================================

/**
 * Extract text from uploaded file based on type
 */
export async function extractText(filePath, mimeType) {
  if (mimeType === 'text/plain') {
    return readFileSync(filePath, 'utf-8');
  }

  if (mimeType === 'application/pdf') {
    // Dynamic import for pdf-parse (it has issues with ESM static import)
    const pdfParse = (await import('pdf-parse')).default;
    const dataBuffer = readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  throw new Error(`Unsupported file type: ${mimeType}. Supported: PDF, TXT`);
}

// ============================================================
// Text Cleaning
// ============================================================

/**
 * Clean extracted text: remove excessive whitespace, control chars, normalize
 */
export function cleanText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove null bytes and control characters (keep newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // Normalize unicode whitespace
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Collapse multiple spaces into one
    .replace(/[ \t]+/g, ' ')
    // Collapse multiple newlines into at most two
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

// ============================================================
// Text Chunking
// ============================================================

/**
 * Split text into chunks for processing.
 * Tries to split at paragraph boundaries first, then sentence boundaries.
 */
export function chunkText(text, maxChunkSize = 4000, overlap = 200) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep overlap from end of current chunk
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        // Single paragraph is too long, split by sentences
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChunkSize) {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              // Single sentence too long, force split
              chunks.push(sentence.substring(0, maxChunkSize));
              currentChunk = sentence.substring(maxChunkSize - overlap);
            }
          } else {
            currentChunk += sentence;
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ============================================================
// Question Validation
// ============================================================

/**
 * Validate a single AI-generated question for correctness and completeness
 */
export function validateQuestion(q) {
  const errors = [];

  if (!q.question || typeof q.question !== 'string' || q.question.length < 10) {
    errors.push('Question text is missing or too short');
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    errors.push('Must have exactly 4 options');
  } else {
    for (let i = 0; i < 4; i++) {
      if (!q.options[i] || typeof q.options[i] !== 'string' || q.options[i].length < 1) {
        errors.push(`Option ${i} is missing or empty`);
      }
    }
    // Check for duplicate options
    const uniqueOptions = new Set(q.options.map(o => o.toLowerCase().trim()));
    if (uniqueOptions.size < 4) {
      errors.push('Options must be unique');
    }
  }

  if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
    errors.push('correctAnswer must be 0, 1, 2, or 3');
  }

  if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.length < 10) {
    errors.push('Explanation is missing or too short');
  }

  if (!q.topic || typeof q.topic !== 'string') {
    errors.push('Topic is missing');
  }

  if (!q.subtopic || typeof q.subtopic !== 'string') {
    errors.push('Subtopic is missing');
  }

  const validDifficulties = ['easy', 'medium', 'hard'];
  if (!q.difficulty || !validDifficulties.includes(q.difficulty)) {
    errors.push(`Difficulty must be one of: ${validDifficulties.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate and filter a batch of questions.
 * Returns only valid questions and logs rejections.
 */
export function validateQuestionBatch(questions) {
  if (!Array.isArray(questions)) return { valid: [], rejected: [] };

  const valid = [];
  const rejected = [];

  for (const q of questions) {
    const result = validateQuestion(q);
    if (result.valid) {
      valid.push(q);
    } else {
      rejected.push({ question: q, errors: result.errors });
      console.warn(`[Cortex] Rejected malformed question: ${result.errors.join(', ')}`);
    }
  }

  return { valid, rejected };
}

// ============================================================
// Content Pipeline (orchestrates the full flow)
// ============================================================

/**
 * Process study material through the full content pipeline:
 * text → clean → chunk → extract topics → extract concepts
 */
export async function processContent(content, type, aiService) {
  // Step 1: Clean the content
  const cleaned = type === 'topic' ? content : cleanText(content);

  // Step 2: Chunk if material (not needed for topic)
  let chunks = [cleaned];
  if (type === 'material' && cleaned.length > 4000) {
    chunks = chunkText(cleaned);
  }

  // Step 3: AI analysis — for topics we analyze directly, for material we analyze the first chunk
  // (subsequent chunks can be used for richer question generation)
  const analysisContent = type === 'topic' ? cleaned : chunks[0];
  const analysis = await aiService.analyzeMaterial(analysisContent, type);

  return {
    title: analysis.title || cleaned.substring(0, 50),
    summary: analysis.summary || '',
    topics: analysis.topics || [],
    cleanedContent: cleaned,
    chunks,
  };
}
