/**
 * Cortex Express Application
 * 
 * All API routes for the adaptive quiz engine.
 * Routes:
 *   POST /api/quiz/create        — Create quiz from topic or material
 *   GET  /api/quiz/:id/status    — Poll analysis/generation status
 *   GET  /api/quiz/:id/next      — Get next adaptive question (no answer exposed)
 *   POST /api/quiz/:id/answer    — Submit answer, get validation + next difficulty
 *   POST /api/quiz/:id/complete  — End quiz and generate report
 *   GET  /api/quiz/:id/report    — Get performance report
 *   POST /api/material/upload    — Upload PDF/TXT file
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import prisma from './db.js';
import { getAIService } from './services/ai.js';
import { AdaptiveEngine, generatePerformanceReport } from './services/adaptive.js';
import { processContent, extractText, validateQuestionBatch } from './services/content.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ============================================================
// Middleware
// ============================================================

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// File upload configuration
const uploadDir = join(__dirname, '..', 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: PDF, TXT`));
    }
  },
});

// In-memory store for quiz processing state + adaptive engines
const quizProcessing = new Map(); // quizId → { stage, progress, error }
const adaptiveEngines = new Map(); // quizId → AdaptiveEngine instance

// ============================================================
// Helper: Get or create adaptive engine for a quiz
// ============================================================

async function getAdaptiveEngine(quizId) {
  if (adaptiveEngines.has(quizId)) {
    return adaptiveEngines.get(quizId);
  }

  // Try to restore from quiz's concept data
  const concepts = await prisma.concept.findMany({ where: { quizId } });
  const engine = new AdaptiveEngine();
  engine.initializeConcepts(concepts.map(c => ({ name: c.name })));
  adaptiveEngines.set(quizId, engine);
  return engine;
}

// ============================================================
// POST /api/quiz/create
// ============================================================

app.post('/api/quiz/create', async (req, res) => {
  try {
    const { type, content, questionCount } = req.body;

    // Validation
    if (!type || !['topic', 'material'].includes(type)) {
      return res.status(400).json({ error: 'type must be "topic" or "material"' });
    }
    if (!content || typeof content !== 'string' || content.trim().length < 2) {
      return res.status(400).json({ error: 'content is required and must be at least 2 characters' });
    }

    const minQ = parseInt(process.env.MIN_QUESTIONS_PER_QUIZ || '5');
    const maxQ = parseInt(process.env.MAX_QUESTIONS_PER_QUIZ || '15');
    const defaultQ = parseInt(process.env.DEFAULT_QUESTIONS || '10');
    const totalQuestions = Math.min(maxQ, Math.max(minQ, questionCount || defaultQ));

    // Create quiz record
    const quiz = await prisma.quiz.create({
      data: {
        id: uuidv4(),
        title: content.substring(0, 100),
        sourceType: type,
        sourceContent: content,
        status: 'analyzing',
        stage: 'analyzing',
        progress: 0,
        totalQuestions,
      },
    });

    // Start async processing pipeline
    processQuizAsync(quiz.id, type, content, totalQuestions).catch(err => {
      console.error(`[Cortex] Quiz processing failed for ${quiz.id}:`, err);
      quizProcessing.set(quiz.id, {
        stage: 'error',
        progress: 0,
        error: err.message || 'Quiz processing failed',
      });
      prisma.quiz.update({
        where: { id: quiz.id },
        data: { status: 'error', stage: 'error' },
      }).catch(() => {});
    });

    // Initialize processing state
    quizProcessing.set(quiz.id, { stage: 'analyzing', progress: 10 });

    res.status(201).json({
      quizId: quiz.id,
      status: 'analyzing',
      message: 'Quiz creation started. Poll /api/quiz/:id/status for updates.',
    });
  } catch (err) {
    console.error('[Cortex] Create quiz error:', err);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

// ============================================================
// Async quiz processing pipeline
// ============================================================

async function processQuizAsync(quizId, type, content, totalQuestions) {
  const ai = getAIService();
  const updateState = (stage, progress) => {
    quizProcessing.set(quizId, { stage, progress });
    prisma.quiz.update({
      where: { id: quizId },
      data: { status: stage, stage, progress },
    }).catch(() => {});
  };

  // Stage 1: Content analysis
  updateState('analyzing', 15);
  const analysis = await processContent(content, type, ai);

  // Stage 2: Extract topics
  updateState('extracting_topics', 30);
  const topicRecords = [];
  for (const topic of analysis.topics) {
    const record = await prisma.topic.create({
      data: {
        id: uuidv4(),
        quizId,
        name: topic.name,
      },
    });
    topicRecords.push({ ...record, concepts: topic.concepts });
  }

  // Stage 3: Extract concepts
  updateState('extracting_concepts', 45);
  const allConcepts = [];
  for (const topic of topicRecords) {
    for (const conceptName of topic.concepts) {
      const concept = await prisma.concept.create({
        data: {
          id: uuidv4(),
          quizId,
          topicId: topic.id,
          name: conceptName,
          mastery: 50.0,
        },
      });
      allConcepts.push({ ...concept, topicName: topic.name });
    }
  }

  // Update quiz title
  await prisma.quiz.update({
    where: { id: quizId },
    data: { title: analysis.title || content.substring(0, 100) },
  });

  // Stage 4: Build concept map for question generation
  updateState('building_map', 55);
  const conceptsForGeneration = allConcepts.map(c => ({
    name: c.name,
    topic: c.topicName,
  }));

  // Stage 5: Generate questions
  updateState('generating_questions', 65);

  // Generate questions in batches across difficulties
  const questionsToGenerate = Math.max(totalQuestions + 5, 15); // Generate extra for selection
  const easyCount = Math.ceil(questionsToGenerate * 0.3);
  const mediumCount = Math.ceil(questionsToGenerate * 0.4);
  const hardCount = questionsToGenerate - easyCount - mediumCount;

  const allQuestions = [];
  const existingQs = [];

  // Generate easy questions
  try {
    const easyResult = await ai.generateQuestions(conceptsForGeneration, 'easy', easyCount, content);
    if (easyResult.questions) {
      const { valid } = validateQuestionBatch(easyResult.questions);
      allQuestions.push(...valid);
      existingQs.push(...valid);
    }
  } catch (e) {
    console.warn('[Cortex] Easy question generation failed:', e.message);
  }

  updateState('generating_questions', 75);

  // Generate medium questions
  try {
    const medResult = await ai.generateQuestions(conceptsForGeneration, 'medium', mediumCount, content, existingQs);
    if (medResult.questions) {
      const { valid } = validateQuestionBatch(medResult.questions);
      allQuestions.push(...valid);
      existingQs.push(...valid);
    }
  } catch (e) {
    console.warn('[Cortex] Medium question generation failed:', e.message);
  }

  updateState('generating_questions', 85);

  // Generate hard questions
  try {
    const hardResult = await ai.generateQuestions(conceptsForGeneration, 'hard', hardCount, content, existingQs);
    if (hardResult.questions) {
      const { valid } = validateQuestionBatch(hardResult.questions);
      allQuestions.push(...valid);
    }
  } catch (e) {
    console.warn('[Cortex] Hard question generation failed:', e.message);
  }

  // Ensure we have minimum questions
  if (allQuestions.length < parseInt(process.env.MIN_QUESTIONS_PER_QUIZ || '5')) {
    throw new Error(`Only generated ${allQuestions.length} valid questions. Minimum required: 5.`);
  }

  // Stage 6: Store questions in DB
  updateState('preparing_engine', 90);
  for (const q of allQuestions) {
    await prisma.question.create({
      data: {
        id: uuidv4(),
        quizId,
        question: q.question,
        options: JSON.stringify(q.options),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        topic: q.topic,
        subtopic: q.subtopic,
        difficulty: q.difficulty,
      },
    });
  }

  // Initialize adaptive engine
  const engine = new AdaptiveEngine();
  engine.initializeConcepts(allConcepts.map(c => ({ name: c.name })));
  adaptiveEngines.set(quizId, engine);

  // Create quiz attempt
  await prisma.quizAttempt.create({
    data: {
      id: uuidv4(),
      quizId,
      totalQuestions: 0,
      correctAnswers: 0,
    },
  });

  // Mark quiz as ready
  updateState('ready', 100);
  await prisma.quiz.update({
    where: { id: quizId },
    data: {
      status: 'ready',
      stage: 'ready',
      progress: 100,
      totalQuestions: Math.min(totalQuestions, allQuestions.length),
    },
  });
}

// ============================================================
// GET /api/quiz/:id/status
// ============================================================

app.get('/api/quiz/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    // Check in-memory state first (more up-to-date during processing)
    const processing = quizProcessing.get(id);

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: {
        topics: { include: { concepts: true } },
        concepts: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const state = processing || { stage: quiz.stage, progress: quiz.progress };

    res.json({
      quizId: id,
      title: quiz.title,
      status: quiz.status,
      stage: state.stage,
      progress: state.progress,
      error: state.error || null,
      totalQuestions: quiz.totalQuestions,
      topics: quiz.topics.map(t => ({
        name: t.name,
        concepts: t.concepts.map(c => c.name),
      })),
    });
  } catch (err) {
    console.error('[Cortex] Status error:', err);
    res.status(500).json({ error: 'Failed to get quiz status' });
  }
});

// ============================================================
// GET /api/quiz/:id/next
// ============================================================

app.get('/api/quiz/:id/next', async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await prisma.quiz.findUnique({ where: { id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.status !== 'ready' && quiz.status !== 'in_progress') {
      return res.status(400).json({ error: `Quiz is not ready. Current status: ${quiz.status}` });
    }

    // Mark as in_progress
    if (quiz.status === 'ready') {
      await prisma.quiz.update({ where: { id }, data: { status: 'in_progress' } });
    }

    // Get adaptive engine
    const engine = await getAdaptiveEngine(id);

    // Get all questions for this quiz
    const questions = await prisma.question.findMany({ where: { quizId: id } });

    // Let the adaptive engine select the next best question
    const nextQuestion = engine.selectNextQuestion(questions);

    if (!nextQuestion) {
      return res.json({
        complete: true,
        message: 'No more questions available',
        state: engine.getState(),
      });
    }

    // Check if we've reached the quiz limit
    const attempt = await prisma.quizAttempt.findFirst({
      where: { quizId: id },
      orderBy: { startedAt: 'desc' },
    });
    const answeredCount = attempt ? attempt.totalQuestions : 0;

    if (answeredCount >= quiz.totalQuestions) {
      return res.json({
        complete: true,
        message: 'Quiz complete',
        state: engine.getState(),
      });
    }

    // IMPORTANT: Do NOT send correctAnswer or explanation to the client
    const safeQuestion = {
      id: nextQuestion.id,
      question: nextQuestion.question,
      options: JSON.parse(nextQuestion.options),
      topic: nextQuestion.topic,
      subtopic: nextQuestion.subtopic,
      difficulty: nextQuestion.difficulty,
    };

    const engineState = engine.getState();

    res.json({
      complete: false,
      question: safeQuestion,
      progress: {
        current: answeredCount + 1,
        total: quiz.totalQuestions,
        difficulty: engineState.currentDifficulty,
        consecutiveCorrect: engineState.consecutiveCorrect,
        consecutiveIncorrect: engineState.consecutiveIncorrect,
      },
      mastery: engineState.conceptMastery,
      topicMastery: engineState.topicMastery,
    });
  } catch (err) {
    console.error('[Cortex] Next question error:', err);
    res.status(500).json({ error: 'Failed to get next question' });
  }
});

// ============================================================
// POST /api/quiz/:id/answer
// ============================================================

app.post('/api/quiz/:id/answer', async (req, res) => {
  try {
    const { id } = req.params;
    const { questionId, selectedAnswer, timeSpent } = req.body;

    // Validation
    if (!questionId) return res.status(400).json({ error: 'questionId is required' });
    if (typeof selectedAnswer !== 'number' || selectedAnswer < 0 || selectedAnswer > 3) {
      return res.status(400).json({ error: 'selectedAnswer must be 0, 1, 2, or 3' });
    }

    // Get the question from DB (server-side validation)
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== id) {
      return res.status(404).json({ error: 'Question not found for this quiz' });
    }

    // Validate answer server-side
    const isCorrect = selectedAnswer === question.correctAnswer;

    // Get adaptive engine and update
    const engine = await getAdaptiveEngine(id);
    const engineUpdate = engine.updateAfterAnswer(
      question.subtopic,
      question.topic,
      isCorrect,
      question.difficulty
    );

    // Update concept mastery in DB
    const concept = await prisma.concept.findFirst({
      where: { quizId: id, name: question.subtopic },
    });
    if (concept) {
      const newMastery = engine.masteryScores.get(question.subtopic) ?? 50;
      await prisma.concept.update({
        where: { id: concept.id },
        data: { mastery: newMastery },
      });
    }

    // Record answer
    const attempt = await prisma.quizAttempt.findFirst({
      where: { quizId: id },
      orderBy: { startedAt: 'desc' },
    });

    if (attempt) {
      await prisma.answer.create({
        data: {
          id: uuidv4(),
          attemptId: attempt.id,
          questionId,
          selectedAnswer,
          isCorrect,
          timeSpent: timeSpent || null,
          difficulty: question.difficulty,
        },
      });

      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          totalQuestions: { increment: 1 },
          correctAnswers: isCorrect ? { increment: 1 } : undefined,
        },
      });
    }

    // Update quiz difficulty
    await prisma.quiz.update({
      where: { id },
      data: {
        difficulty: engineUpdate.currentDifficulty,
        currentIndex: { increment: 1 },
      },
    });

    // NOW send the correct answer and explanation (after recording)
    res.json({
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      selectedAnswer,
      mastery: engineUpdate.conceptMastery,
      topicMastery: engineUpdate.topicMastery,
      nextDifficulty: engineUpdate.currentDifficulty,
      difficultyHistory: engineUpdate.difficultyHistory,
      consecutiveCorrect: engineUpdate.consecutiveCorrect,
      consecutiveIncorrect: engineUpdate.consecutiveIncorrect,
    });
  } catch (err) {
    console.error('[Cortex] Answer error:', err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// ============================================================
// POST /api/quiz/:id/complete
// ============================================================

app.post('/api/quiz/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await prisma.quiz.findUnique({ where: { id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const engine = await getAdaptiveEngine(id);
    const report = generatePerformanceReport(engine, quiz.title);

    // Try to get AI learning insight
    try {
      const ai = getAIService();
      const insightResult = await ai.generateLearningInsight(report);
      report.aiInsight = insightResult.insight || '';
      report.recommendations = insightResult.recommendations || report.recommendations;
    } catch (e) {
      console.warn('[Cortex] AI insight generation failed:', e.message);
      report.aiInsight = 'Unable to generate AI insight at this time.';
      report.recommendations = [
        'Review the weak topics identified above',
        'Practice with more questions on your weak areas',
        'Try to understand the explanations for incorrect answers',
      ];
    }

    // Save report to DB
    await prisma.performanceReport.upsert({
      where: { quizId: id },
      update: {
        totalQuestions: report.totalQuestions,
        correctAnswers: report.correctAnswers,
        accuracy: report.accuracy,
        avgDifficulty: report.avgDifficulty,
        topicPerformance: JSON.stringify(report.topicPerformance),
        conceptMastery: JSON.stringify(report.conceptMastery),
        strengths: JSON.stringify(report.strengths),
        weaknesses: JSON.stringify(report.weaknesses),
        difficultyProgression: JSON.stringify(report.difficultyProgression),
        recommendations: JSON.stringify(report.recommendations),
        aiInsight: report.aiInsight,
      },
      create: {
        id: uuidv4(),
        quizId: id,
        totalQuestions: report.totalQuestions,
        correctAnswers: report.correctAnswers,
        accuracy: report.accuracy,
        avgDifficulty: report.avgDifficulty,
        topicPerformance: JSON.stringify(report.topicPerformance),
        conceptMastery: JSON.stringify(report.conceptMastery),
        strengths: JSON.stringify(report.strengths),
        weaknesses: JSON.stringify(report.weaknesses),
        difficultyProgression: JSON.stringify(report.difficultyProgression),
        recommendations: JSON.stringify(report.recommendations),
        aiInsight: report.aiInsight,
      },
    });

    // Mark quiz as completed
    await prisma.quiz.update({
      where: { id },
      data: { status: 'completed' },
    });

    // Complete the attempt
    const attempt = await prisma.quizAttempt.findFirst({
      where: { quizId: id },
      orderBy: { startedAt: 'desc' },
    });
    if (attempt) {
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { completedAt: new Date() },
      });
    }

    res.json(report);
  } catch (err) {
    console.error('[Cortex] Complete quiz error:', err);
    res.status(500).json({ error: 'Failed to complete quiz' });
  }
});

// ============================================================
// GET /api/quiz/:id/report
// ============================================================

app.get('/api/quiz/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    const report = await prisma.performanceReport.findUnique({
      where: { quizId: id },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found. Complete the quiz first.' });
    }

    res.json({
      ...report,
      topicPerformance: JSON.parse(report.topicPerformance),
      conceptMastery: JSON.parse(report.conceptMastery),
      strengths: JSON.parse(report.strengths),
      weaknesses: JSON.parse(report.weaknesses),
      difficultyProgression: JSON.parse(report.difficultyProgression),
      recommendations: JSON.parse(report.recommendations),
    });
  } catch (err) {
    console.error('[Cortex] Report error:', err);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// ============================================================
// POST /api/material/upload
// ============================================================

app.post('/api/material/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = await extractText(req.file.path, req.file.mimetype);

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract enough text from the file. Please ensure the file contains readable text.' });
    }

    res.json({
      text: text.substring(0, 10000), // Return first 10k chars for preview
      fullLength: text.length,
      fileName: req.file.originalname,
    });
  } catch (err) {
    console.error('[Cortex] Upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process uploaded file' });
  }
});

// ============================================================
// Health check
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'cortex-adaptive-quiz', timestamp: new Date().toISOString() });
});

// ============================================================
// Error handler
// ============================================================

app.use((err, req, res, _next) => {
  console.error('[Cortex] Unhandled error:', err);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal server error',
  });
});

export default app;
