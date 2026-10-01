/**
 * Cortex Adaptive Difficulty Engine
 * 
 * Deterministic adaptive algorithm that models learner mastery per concept,
 * adjusts difficulty based on performance patterns, and selects optimal
 * next questions to target knowledge gaps.
 */

// ============================================================
// Configuration — all thresholds are configurable
// ============================================================

const DEFAULT_CONFIG = {
  // Mastery thresholds for difficulty targeting
  EASY_CEILING: 40,          // Below this → easy questions
  MEDIUM_CEILING: 60,        // Below this → medium questions
  HARD_FLOOR: 60,            // Above this → medium/hard mix
  CHALLENGE_FLOOR: 80,       // Above this → hard questions

  // Streak thresholds
  CONSECUTIVE_TO_INCREASE: 2, // Correct streak to bump difficulty
  CONSECUTIVE_TO_DECREASE: 2, // Incorrect streak to lower difficulty

  // Recent accuracy window
  RECENT_WINDOW: 5,
  HIGH_ACCURACY_THRESHOLD: 0.8,
  LOW_ACCURACY_THRESHOLD: 0.4,

  // Mastery update deltas
  BASE_CORRECT_DELTA: 12,
  BASE_INCORRECT_DELTA: -10,
  DIFFICULTY_MULTIPLIERS: { easy: 0.7, medium: 1.0, hard: 1.3 },

  // Diminishing returns
  HIGH_MASTERY_CORRECT_FACTOR: 0.5,   // Slower gains above 80%
  HIGH_MASTERY_INCORRECT_FACTOR: 1.3, // Bigger penalty above 70%

  // Question selection weights
  WEAK_CONCEPT_BONUS: 30,
  WEAK_TOPIC_BONUS: 15,
  TARGET_DIFFICULTY_BONUS: 25,
  UNTESTED_CONCEPT_BONUS: 20,
  RECENT_REPEAT_PENALTY: -15,
  VARIETY_FACTOR: 5,

  // Initial mastery
  INITIAL_MASTERY: 50,
};

// ============================================================
// Adaptive Engine
// ============================================================

export class AdaptiveEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.masteryScores = new Map();     // concept → score (0-100)
    this.topicMastery = new Map();      // topic → score (0-100)
    this.consecutiveCorrect = 0;
    this.consecutiveIncorrect = 0;
    this.answerHistory = [];
    this.currentDifficulty = 'medium';
    this.answeredQuestionIds = new Set();
    this.difficultyHistory = ['medium'];
    this.conceptQuestionCount = new Map(); // concept → times tested
  }

  /**
   * Initialize mastery scores from concept list
   */
  initializeConcepts(concepts) {
    for (const concept of concepts) {
      if (!this.masteryScores.has(concept.name)) {
        this.masteryScores.set(concept.name, this.config.INITIAL_MASTERY);
      }
    }
  }

  /**
   * Core update: called after every answer
   * Returns updated engine state
   */
  updateAfterAnswer(concept, topic, isCorrect, difficulty) {
    // 1. Update concept mastery
    const currentMastery = this.masteryScores.get(concept) ?? this.config.INITIAL_MASTERY;
    const delta = this._calculateDelta(isCorrect, difficulty, currentMastery);
    const newMastery = Math.max(0, Math.min(100, currentMastery + delta));
    this.masteryScores.set(concept, Math.round(newMastery * 10) / 10);

    // 2. Update topic mastery (average of concept masteries in that topic)
    this._updateTopicMastery(topic);

    // 3. Update streaks
    if (isCorrect) {
      this.consecutiveCorrect++;
      this.consecutiveIncorrect = 0;
    } else {
      this.consecutiveIncorrect++;
      this.consecutiveCorrect = 0;
    }

    // 4. Record in history
    this.answerHistory.push({
      concept,
      topic,
      isCorrect,
      difficulty,
      timestamp: Date.now(),
      masteryAfter: newMastery,
    });

    // 5. Track concept question count
    this.conceptQuestionCount.set(concept, (this.conceptQuestionCount.get(concept) || 0) + 1);

    // 6. Adjust difficulty
    this._adjustDifficulty();

    return this.getState();
  }

  /**
   * Select the best next question from available pool
   */
  selectNextQuestion(availableQuestions) {
    // Filter out already answered
    const unanswered = availableQuestions.filter(q => !this.answeredQuestionIds.has(q.id));
    if (unanswered.length === 0) return null;

    // Score each question
    const scored = unanswered.map(q => ({
      question: q,
      score: this._scoreQuestion(q),
    }));

    // Sort by score (highest = best next question)
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0].question;
    this.answeredQuestionIds.add(selected.id);
    return selected;
  }

  /**
   * Determine what kind of question to generate next
   * Returns { concept, difficulty, topic } for the AI to target
   */
  getNextQuestionSpec() {
    const weakest = this._getWeakestConcepts(3);
    const targetConcept = weakest[0];
    const targetDifficulty = this._getTargetDifficulty(
      targetConcept ? (this.masteryScores.get(targetConcept.concept) ?? 50) : 50
    );

    return {
      concept: targetConcept?.concept || null,
      topic: targetConcept?.topic || null,
      difficulty: targetDifficulty,
      reason: this._getSelectionReason(targetConcept, targetDifficulty),
    };
  }

  /**
   * Get full engine state (for frontend)
   */
  getState() {
    return {
      currentDifficulty: this.currentDifficulty,
      consecutiveCorrect: this.consecutiveCorrect,
      consecutiveIncorrect: this.consecutiveIncorrect,
      conceptMastery: Object.fromEntries(this.masteryScores),
      topicMastery: Object.fromEntries(this.topicMastery),
      difficultyHistory: [...this.difficultyHistory],
      totalAnswered: this.answerHistory.length,
      recentAccuracy: this._getRecentAccuracy(),
      overallAccuracy: this._getOverallAccuracy(),
    };
  }

  /**
   * Export state for persistence
   */
  serialize() {
    return {
      masteryScores: Object.fromEntries(this.masteryScores),
      topicMastery: Object.fromEntries(this.topicMastery),
      consecutiveCorrect: this.consecutiveCorrect,
      consecutiveIncorrect: this.consecutiveIncorrect,
      answerHistory: this.answerHistory,
      currentDifficulty: this.currentDifficulty,
      answeredQuestionIds: [...this.answeredQuestionIds],
      difficultyHistory: this.difficultyHistory,
      conceptQuestionCount: Object.fromEntries(this.conceptQuestionCount),
    };
  }

  /**
   * Restore state from persistence
   */
  static deserialize(data) {
    const engine = new AdaptiveEngine();
    if (data.masteryScores) engine.masteryScores = new Map(Object.entries(data.masteryScores));
    if (data.topicMastery) engine.topicMastery = new Map(Object.entries(data.topicMastery));
    if (data.consecutiveCorrect !== undefined) engine.consecutiveCorrect = data.consecutiveCorrect;
    if (data.consecutiveIncorrect !== undefined) engine.consecutiveIncorrect = data.consecutiveIncorrect;
    if (data.answerHistory) engine.answerHistory = data.answerHistory;
    if (data.currentDifficulty) engine.currentDifficulty = data.currentDifficulty;
    if (data.answeredQuestionIds) engine.answeredQuestionIds = new Set(data.answeredQuestionIds);
    if (data.difficultyHistory) engine.difficultyHistory = data.difficultyHistory;
    if (data.conceptQuestionCount) engine.conceptQuestionCount = new Map(Object.entries(data.conceptQuestionCount));
    return engine;
  }

  // ============================================================
  // Private methods
  // ============================================================

  _calculateDelta(isCorrect, difficulty, currentMastery) {
    const C = this.config;
    const multiplier = C.DIFFICULTY_MULTIPLIERS[difficulty] || 1;
    let delta = isCorrect ? C.BASE_CORRECT_DELTA : C.BASE_INCORRECT_DELTA;

    // Apply difficulty multiplier
    delta *= multiplier;

    // Diminishing returns at high mastery
    if (isCorrect && currentMastery > 80) {
      delta *= C.HIGH_MASTERY_CORRECT_FACTOR;
    }

    // Bigger penalty at high mastery for incorrect (you should know this!)
    if (!isCorrect && currentMastery > 70) {
      delta *= C.HIGH_MASTERY_INCORRECT_FACTOR;
    }

    return delta;
  }

  _updateTopicMastery(topic) {
    // Compute average mastery of all concepts that have been associated with this topic
    const conceptsForTopic = [];
    for (const entry of this.answerHistory) {
      if (entry.topic === topic && !conceptsForTopic.includes(entry.concept)) {
        conceptsForTopic.push(entry.concept);
      }
    }

    if (conceptsForTopic.length > 0) {
      const avg = conceptsForTopic.reduce((sum, c) => {
        return sum + (this.masteryScores.get(c) ?? 50);
      }, 0) / conceptsForTopic.length;
      this.topicMastery.set(topic, Math.round(avg * 10) / 10);
    }
  }

  _adjustDifficulty() {
    const C = this.config;
    let newDifficulty = this.currentDifficulty;

    // Streak-based adjustment
    if (this.consecutiveCorrect >= C.CONSECUTIVE_TO_INCREASE) {
      newDifficulty = this._increaseDifficulty(newDifficulty);
    }
    if (this.consecutiveIncorrect >= C.CONSECUTIVE_TO_DECREASE) {
      newDifficulty = this._decreaseDifficulty(newDifficulty);
    }

    // Recent accuracy-based adjustment (override if strong signal)
    const recentAccuracy = this._getRecentAccuracy();
    if (this.answerHistory.length >= C.RECENT_WINDOW) {
      if (recentAccuracy >= C.HIGH_ACCURACY_THRESHOLD && newDifficulty !== 'hard') {
        newDifficulty = this._increaseDifficulty(newDifficulty);
      }
      if (recentAccuracy <= C.LOW_ACCURACY_THRESHOLD && newDifficulty !== 'easy') {
        newDifficulty = this._decreaseDifficulty(newDifficulty);
      }
    }

    this.currentDifficulty = newDifficulty;
    this.difficultyHistory.push(newDifficulty);
  }

  _increaseDifficulty(d) {
    if (d === 'easy') return 'medium';
    if (d === 'medium') return 'hard';
    return 'hard';
  }

  _decreaseDifficulty(d) {
    if (d === 'hard') return 'medium';
    if (d === 'medium') return 'easy';
    return 'easy';
  }

  _scoreQuestion(question) {
    const C = this.config;
    let score = 0;

    // 1. Prioritize weak concepts
    const weakConcepts = this._getWeakestConcepts(3).map(w => w.concept);
    if (weakConcepts.includes(question.subtopic)) score += C.WEAK_CONCEPT_BONUS;
    if (weakConcepts.includes(question.topic)) score += C.WEAK_TOPIC_BONUS;

    // 2. Match target difficulty
    const conceptMastery = this.masteryScores.get(question.subtopic) ?? this.config.INITIAL_MASTERY;
    const targetDifficulty = this._getTargetDifficulty(conceptMastery);
    if (question.difficulty === targetDifficulty) score += C.TARGET_DIFFICULTY_BONUS;

    // 3. Prefer untested concepts
    if (!this.conceptQuestionCount.has(question.subtopic)) score += C.UNTESTED_CONCEPT_BONUS;

    // 4. Penalize recently tested concepts
    const recentConcepts = this.answerHistory.slice(-3).map(a => a.concept);
    if (recentConcepts.includes(question.subtopic)) score += C.RECENT_REPEAT_PENALTY;

    // 5. Small random factor for variety
    score += Math.random() * C.VARIETY_FACTOR;

    return score;
  }

  _getTargetDifficulty(mastery) {
    const C = this.config;
    if (mastery < C.EASY_CEILING) return 'easy';
    if (mastery < C.MEDIUM_CEILING) return 'medium';
    if (mastery < C.CHALLENGE_FLOOR) return Math.random() > 0.4 ? 'medium' : 'hard';
    return 'hard';
  }

  _getWeakestConcepts(n) {
    const entries = [...this.masteryScores.entries()]
      .map(([concept, mastery]) => {
        // Find the topic for this concept from answer history
        const historyEntry = this.answerHistory.find(a => a.concept === concept);
        return { concept, mastery, topic: historyEntry?.topic || '' };
      })
      .sort((a, b) => a.mastery - b.mastery);
    return entries.slice(0, n);
  }

  _getRecentAccuracy() {
    const recent = this.answerHistory.slice(-this.config.RECENT_WINDOW);
    if (recent.length === 0) return 0.5;
    return recent.filter(a => a.isCorrect).length / recent.length;
  }

  _getOverallAccuracy() {
    if (this.answerHistory.length === 0) return 0;
    return this.answerHistory.filter(a => a.isCorrect).length / this.answerHistory.length;
  }

  _getSelectionReason(weakestConcept, targetDifficulty) {
    if (!weakestConcept) return 'Initial question selection';
    const mastery = weakestConcept.mastery ?? 50;
    if (mastery < 40) return `Reinforcing weak concept: ${weakestConcept.concept} (${Math.round(mastery)}% mastery)`;
    if (mastery < 60) return `Building competence in: ${weakestConcept.concept} (${Math.round(mastery)}% mastery)`;
    if (mastery < 80) return `Challenging knowledge of: ${weakestConcept.concept} (${Math.round(mastery)}% mastery)`;
    return `Advanced challenge for: ${weakestConcept.concept} (${Math.round(mastery)}% mastery)`;
  }
}

// ============================================================
// Performance Report Generator
// ============================================================

export function generatePerformanceReport(engine, quizTitle) {
  const state = engine.getState();
  const history = engine.answerHistory;

  if (history.length === 0) {
    return {
      totalQuestions: 0,
      correctAnswers: 0,
      accuracy: 0,
      avgDifficulty: 'medium',
      topicPerformance: {},
      conceptMastery: {},
      strengths: [],
      weaknesses: [],
      difficultyProgression: [],
      recommendations: [],
      aiInsight: '',
    };
  }

  const totalQuestions = history.length;
  const correctAnswers = history.filter(a => a.isCorrect).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100);

  // Average difficulty
  const difficultyValues = { easy: 1, medium: 2, hard: 3 };
  const avgDiffNum = history.reduce((sum, a) => sum + (difficultyValues[a.difficulty] || 2), 0) / history.length;
  const avgDifficulty = avgDiffNum < 1.5 ? 'easy' : avgDiffNum < 2.5 ? 'medium' : 'hard';

  // Topic performance
  const topicPerformance = {};
  for (const entry of history) {
    if (!topicPerformance[entry.topic]) {
      topicPerformance[entry.topic] = { correct: 0, total: 0 };
    }
    topicPerformance[entry.topic].total++;
    if (entry.isCorrect) topicPerformance[entry.topic].correct++;
  }
  // Convert to percentages
  for (const topic of Object.keys(topicPerformance)) {
    const tp = topicPerformance[topic];
    topicPerformance[topic] = Math.round((tp.correct / tp.total) * 100);
  }

  // Concept mastery (final)
  const conceptMastery = state.conceptMastery;

  // Strengths & weaknesses
  const conceptEntries = Object.entries(conceptMastery).sort((a, b) => b[1] - a[1]);
  const strengths = conceptEntries.filter(([, m]) => m >= 70).map(([c]) => c);
  const weaknesses = conceptEntries.filter(([, m]) => m < 50).map(([c]) => c);

  // Difficulty progression
  const difficultyProgression = state.difficultyHistory;

  return {
    title: quizTitle,
    totalQuestions,
    correctAnswers,
    incorrectAnswers: totalQuestions - correctAnswers,
    accuracy,
    avgDifficulty,
    topicPerformance,
    conceptMastery,
    strengths: strengths.length > 0 ? strengths : ['Keep practicing to build strengths!'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['No major weaknesses identified — great job!'],
    difficultyProgression,
    recommendations: [],
    aiInsight: '',
  };
}
