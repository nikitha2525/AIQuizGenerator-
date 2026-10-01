/**
 * Cortex AI Service Abstraction Layer
 * 
 * Supports Google Gemini (free tier) as the primary AI provider.
 * Falls back to a built-in intelligent mock engine when no API key is set.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================
// AI Provider Interface (Abstract)
// ============================================================

class AIProvider {
  async analyzeMaterial(content, type) { throw new Error('Not implemented'); }
  async generateQuestions(concepts, difficulty, count, sourceContent, existingQuestions) { throw new Error('Not implemented'); }
  async generateSingleQuestion(concept, difficulty, topic, existingQuestions, sourceContent) { throw new Error('Not implemented'); }
  async generateLearningInsight(performanceData) { throw new Error('Not implemented'); }
}

// ============================================================
// Google Gemini Provider (FREE tier)
// ============================================================

class GeminiProvider extends AIProvider {
  constructor(apiKey) {
    super();
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async _chat(prompt) {
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from the response (Gemini may wrap it in ```json blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON object
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0];
      }
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Failed to parse AI response as JSON: ${e.message}\nRaw: ${text.substring(0, 500)}`);
    }
  }

  async analyzeMaterial(content, type = 'topic') {
    const prompt = type === 'topic'
      ? `You are an expert educational content analyst. Analyze the following topic and break it down into a comprehensive knowledge structure for quiz generation.

Topic: "${content}"

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "title": "A compelling quiz title based on the topic",
  "summary": "Brief 1-2 sentence summary of what this quiz covers",
  "topics": [
    {
      "name": "Main Topic Area",
      "concepts": ["Specific Concept 1", "Specific Concept 2", "Specific Concept 3"]
    }
  ]
}

Rules:
- Extract 3-6 main topics
- Each topic should have 2-5 specific, testable concepts
- Concepts should be granular enough to generate focused questions
- Cover breadth and depth of the subject
- Use proper terminology`
      : `You are an expert educational content analyst. Analyze the following study material and extract a structured knowledge map.

Study Material:
"""
${content.substring(0, 8000)}
"""

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "title": "A compelling quiz title based on the material",
  "summary": "Brief 1-2 sentence summary of what this material covers",
  "topics": [
    {
      "name": "Main Topic Area",
      "concepts": ["Specific Concept 1", "Specific Concept 2", "Specific Concept 3"]
    }
  ]
}

Rules:
- Extract the key topics actually covered in the material
- Each topic should have 2-5 specific, testable concepts
- Focus on concepts that can be tested with multiple-choice questions
- Ensure concepts are directly supported by the material content`;

    return this._chat(prompt);
  }

  async generateQuestions(concepts, difficulty, count, sourceContent = '', existingQuestions = []) {
    const existingText = existingQuestions.length > 0
      ? `\n\nALREADY GENERATED QUESTIONS (do NOT repeat these or create very similar ones):\n${existingQuestions.map(q => `- ${q.question}`).join('\n')}`
      : '';

    const contextText = sourceContent
      ? `\n\nSource Material Context:\n"""${sourceContent.substring(0, 4000)}"""`
      : '';

    const prompt = `You are an expert question generator. Generate exactly ${count} multiple-choice questions testing the following concepts.

Concepts to test: ${JSON.stringify(concepts)}
Target difficulty: ${difficulty}
${contextText}${existingText}

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "questions": [
    {
      "question": "Clear, unambiguous question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Detailed explanation that teaches the concept.",
      "topic": "The main topic this question belongs to",
      "subtopic": "The specific concept being tested",
      "difficulty": "${difficulty}"
    }
  ]
}

STRICT Rules:
- Generate EXACTLY ${count} questions
- correctAnswer must be an integer 0-3 (index of the correct option)
- ALL 4 options must be plausible and similar in length/structure
- NEVER use "All of the above" or "None of the above"
- Vary the position of the correct answer (don't always put it first)
- Each question must clearly test ONE specific concept
- Explanations should be educational, 2-4 sentences
- Questions at different difficulties:
  * easy: Tests recall and basic understanding
  * medium: Tests application and analysis
  * hard: Tests synthesis, evaluation, and edge cases
- Each question must be unique and test a different aspect`;

    return this._chat(prompt);
  }

  async generateSingleQuestion(concept, difficulty, topic, existingQuestions = [], sourceContent = '') {
    const result = await this.generateQuestions(
      [{ name: concept, topic }],
      difficulty,
      1,
      sourceContent,
      existingQuestions
    );
    return result.questions?.[0] || null;
  }

  async generateLearningInsight(performanceData) {
    const prompt = `You are an expert learning diagnostician. Analyze this quiz performance and provide a personalized learning insight.

Performance Data:
- Overall Accuracy: ${performanceData.accuracy}%
- Total Questions: ${performanceData.totalQuestions}
- Correct: ${performanceData.correctAnswers}
- Average Difficulty: ${performanceData.avgDifficulty}
- Strong Topics: ${JSON.stringify(performanceData.strengths)}
- Weak Topics: ${JSON.stringify(performanceData.weaknesses)}
- Topic Performance: ${JSON.stringify(performanceData.topicPerformance)}
- Concept Mastery: ${JSON.stringify(performanceData.conceptMastery)}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "insight": "A 2-4 sentence personalized learning insight. Identify HOW the learner thinks. Diagnose WHY they struggle with weak areas. Be specific and constructive.",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ]
}`;

    return this._chat(prompt);
  }
}

// ============================================================
// Mock AI Provider (Intelligent Fallback Engine)
// ============================================================

class MockAIProvider extends AIProvider {
  async analyzeMaterial(content, type = 'topic') {
    const sanitizedTitle = type === 'topic'
      ? content.trim()
      : (content.split('\n').find(l => l.trim().length > 0)?.substring(0, 60) || 'Uploaded Study Material');

    const topics = [
      {
        name: `${sanitizedTitle} - Core Principles`,
        concepts: [
          `Fundamentals of ${sanitizedTitle.substring(0, 30)}`,
          `Key Concepts & Standard Terminology`,
          `Essential Mechanics & Structural Foundations`
        ]
      },
      {
        name: `${sanitizedTitle} - Practical Applications`,
        concepts: [
          `Implementation Strategies`,
          `Analytical Frameworks`,
          `Problem Solving & Case Studies`
        ]
      },
      {
        name: `${sanitizedTitle} - Advanced Analysis`,
        concepts: [
          `System Architecture & Synthesis`,
          `Performance Optimization & Edge Cases`,
          `Evaluation & Critical Thinking`
        ]
      }
    ];

    return {
      title: `${sanitizedTitle} Adaptive Quiz`,
      summary: `Comprehensive adaptive quiz evaluating key concepts in ${sanitizedTitle}.`,
      topics
    };
  }

  async generateQuestions(concepts, difficulty, count, sourceContent = '', existingQuestions = []) {
    const questions = [];

    for (let i = 0; i < count; i++) {
      const conceptObj = concepts[i % concepts.length] || { name: 'General Principle', topic: 'Core Concepts' };
      const conceptName = conceptObj.name || conceptObj;
      const topicName = conceptObj.topic || 'Core Knowledge';

      let qText, options, correctAnswer, explanation;

      if (difficulty === 'easy') {
        qText = `Which of the following best defines '${conceptName}' within ${topicName}?`;
        options = [
          `The foundational rule governing how ${conceptName} operates in practice.`,
          `An optional legacy configuration used primarily in edge cases.`,
          `A deprecated manual process superseded by automated scripts.`,
          `An unrelated external standard with no operational impact.`
        ];
        correctAnswer = 0;
        explanation = `Option A is correct. '${conceptName}' is fundamentally defined as the core principle governing behavior within ${topicName}. Options B, C, and D describe incorrect or irrelevant concepts.`;
      } else if (difficulty === 'medium') {
        qText = `When applying '${conceptName}' to solve real-world problems, what is the key consideration?`;
        options = [
          `Ignoring system constraints to maximize raw execution speed.`,
          `Balancing input requirements with output validation to ensure reliability.`,
          `Hardcoding static values to minimize dynamic runtime processing.`,
          `Bypassing error handling checkpoints to reduce execution latency.`
        ];
        correctAnswer = 1;
        explanation = `Option B is correct. Practical application of ${conceptName} requires balancing input and output validation to ensure system reliability. Disabling safety checks or hardcoding values creates vulnerabilities.`;
      } else {
        qText = `In a complex scenario involving '${conceptName}', how should you evaluate constraint failure modes?`;
        options = [
          `Assume the underlying system operates deterministically without requiring inspection.`,
          `Synthesize diagnostic metrics, analyze boundary conditions, and re-calibrate control parameters.`,
          `Revert recent structural changes unconditionally without reading diagnostic trace logs.`,
          `Increase system timeout thresholds indefinitely to mask potential failure signals.`
        ];
        correctAnswer = 1;
        explanation = `Option B is correct. Advanced evaluation requires synthesizing diagnostic data and inspecting boundary conditions. Masking signals or making unguided reversions hides root causes.`;
      }

      // Rotate correct answer position
      const rotateIdx = (i + (difficulty === 'medium' ? 1 : difficulty === 'hard' ? 2 : 0)) % 4;
      const rotatedOptions = [...options];
      const [movedItem] = rotatedOptions.splice(correctAnswer, 1);
      rotatedOptions.splice(rotateIdx, 0, movedItem);

      questions.push({
        question: qText,
        options: rotatedOptions,
        correctAnswer: rotateIdx,
        explanation,
        topic: topicName,
        subtopic: conceptName,
        difficulty
      });
    }

    return { questions };
  }

  async generateSingleQuestion(concept, difficulty, topic, existingQuestions = [], sourceContent = '') {
    const res = await this.generateQuestions([{ name: concept, topic }], difficulty, 1, sourceContent, existingQuestions);
    return res.questions?.[0] || null;
  }

  async generateLearningInsight(performanceData) {
    return {
      insight: `Based on your quiz performance (${performanceData.accuracy}% accuracy), you showed strong foundational recall, with opportunities to deepen mastery in higher-difficulty analytical questions.`,
      recommendations: [
        'Review subtopics where performance dipped at Medium and Hard difficulty levels.',
        'Focus on applying core principles to multi-step problem scenarios.',
        'Re-test weak concept areas using adaptive follow-up quizzes.'
      ]
    };
  }
}

// ============================================================
// Smart Fallback AI Provider
// ============================================================

class SmartFallbackAIProvider extends AIProvider {
  constructor(geminiKey) {
    super();
    this.primary = null;
    this.mock = new MockAIProvider();

    if (geminiKey && geminiKey.trim().length > 5) {
      try {
        this.primary = new GeminiProvider(geminiKey);
        console.log('[Cortex AI] Google Gemini (free tier) initialized successfully.');
      } catch (err) {
        console.warn(`[Cortex AI] Failed to initialize Gemini: ${err.message}`);
      }
    }

    if (!this.primary) {
      console.log('[Cortex AI] No AI API key configured. Using built-in Adaptive Quiz Engine.');
      console.log('[Cortex AI] For AI-powered questions, add GEMINI_API_KEY to your .env file.');
      console.log('[Cortex AI] Get a free key at: https://aistudio.google.com/apikey');
    }
  }

  async analyzeMaterial(content, type) {
    if (this.primary) {
      try {
        return await this.primary.analyzeMaterial(content, type);
      } catch (err) {
        console.warn(`[Cortex AI] Gemini analyzeMaterial failed (${err.message}). Using fallback engine.`);
      }
    }
    return this.mock.analyzeMaterial(content, type);
  }

  async generateQuestions(concepts, difficulty, count, sourceContent, existingQuestions) {
    if (this.primary) {
      try {
        return await this.primary.generateQuestions(concepts, difficulty, count, sourceContent, existingQuestions);
      } catch (err) {
        console.warn(`[Cortex AI] Gemini generateQuestions failed (${err.message}). Using fallback engine.`);
      }
    }
    return this.mock.generateQuestions(concepts, difficulty, count, sourceContent, existingQuestions);
  }

  async generateSingleQuestion(concept, difficulty, topic, existingQuestions, sourceContent) {
    if (this.primary) {
      try {
        return await this.primary.generateSingleQuestion(concept, difficulty, topic, existingQuestions, sourceContent);
      } catch (err) {
        console.warn(`[Cortex AI] Gemini generateSingleQuestion failed (${err.message}). Using fallback engine.`);
      }
    }
    return this.mock.generateSingleQuestion(concept, difficulty, topic, existingQuestions, sourceContent);
  }

  async generateLearningInsight(performanceData) {
    if (this.primary) {
      try {
        return await this.primary.generateLearningInsight(performanceData);
      } catch (err) {
        console.warn(`[Cortex AI] Gemini generateLearningInsight failed (${err.message}). Using fallback engine.`);
      }
    }
    return this.mock.generateLearningInsight(performanceData);
  }
}

// ============================================================
// AI Service Factory
// ============================================================

let aiServiceInstance = null;

export function getAIService() {
  if (!aiServiceInstance) {
    // Try Gemini key first, then fall back to OpenAI key, then mock
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
    aiServiceInstance = new SmartFallbackAIProvider(apiKey);
  }
  return aiServiceInstance;
}

export { AIProvider, GeminiProvider, MockAIProvider, SmartFallbackAIProvider };
