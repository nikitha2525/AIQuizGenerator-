/**
 * Cortex API Client
 */

const API_BASE = '/api';

export const api = {
  /**
   * Upload a file and extract its text
   */
  async uploadMaterial(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/material/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to upload file');
    }
    
    return res.json();
  },

  /**
   * Create a new quiz from a topic or material
   */
  async createQuiz(type, content, questionCount = 10) {
    const res = await fetch(`${API_BASE}/quiz/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, questionCount }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to create quiz');
    }
    
    return res.json();
  },

  /**
   * Check the status of quiz generation
   */
  async getQuizStatus(quizId) {
    const res = await fetch(`${API_BASE}/quiz/${quizId}/status`);
    if (!res.ok) throw new Error('Failed to get quiz status');
    return res.json();
  },

  /**
   * Get the next question
   */
  async getNextQuestion(quizId) {
    const res = await fetch(`${API_BASE}/quiz/${quizId}/next`);
    if (!res.ok) throw new Error('Failed to get next question');
    return res.json();
  },

  /**
   * Submit an answer
   */
  async submitAnswer(quizId, questionId, selectedAnswer, timeSpent) {
    const res = await fetch(`${API_BASE}/quiz/${quizId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, selectedAnswer, timeSpent }),
    });
    if (!res.ok) throw new Error('Failed to submit answer');
    return res.json();
  },

  /**
   * Complete quiz and generate report
   */
  async completeQuiz(quizId) {
    const res = await fetch(`${API_BASE}/quiz/${quizId}/complete`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to complete quiz');
    return res.json();
  },

  /**
   * Get performance report
   */
  async getReport(quizId) {
    const res = await fetch(`${API_BASE}/quiz/${quizId}/report`);
    if (!res.ok) throw new Error('Failed to fetch report');
    return res.json();
  }
};
