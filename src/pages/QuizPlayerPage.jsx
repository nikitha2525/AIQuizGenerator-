import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Brain, ArrowRight, Loader2, Zap, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import './QuizPlayerPage.css';

export default function QuizPlayerPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [mastery, setMastery] = useState(null);
  
  const [selectedOption, setSelectedOption] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { isCorrect, correctAnswer, explanation, nextDifficulty }
  const [error, setError] = useState(null);
  const startTimeRef = useRef(Date.now());

  // Load next question
  const loadNextQuestion = async () => {
    try {
      setQuestion(null);
      setResult(null);
      setSelectedOption(null);
      setError(null);
      setIsSubmitting(false);
      
      const res = await api.getNextQuestion(quizId);
      
      if (res.complete) {
        // Quiz is over, redirect to report
        navigate(`/report/${quizId}`);
        return;
      }
      
      setQuestion(res.question);
      setProgress(res.progress);
      setMastery(res.mastery);
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(err.message || 'Failed to load question');
    }
  };

  useEffect(() => {
    loadNextQuestion();
  }, [quizId]);

  const handleSubmit = async () => {
    if (selectedOption === null || isSubmitting || result) return;
    
    setIsSubmitting(true);
    const timeSpent = Date.now() - startTimeRef.current;
    
    try {
      const res = await api.submitAnswer(quizId, question.id, selectedOption, timeSpent);
      setResult(res);
      setMastery(res.mastery);
      setProgress(prev => ({
        ...prev,
        difficulty: res.nextDifficulty,
        consecutiveCorrect: res.consecutiveCorrect,
        consecutiveIncorrect: res.consecutiveIncorrect
      }));
    } catch (err) {
      setError(err.message || 'Failed to submit answer');
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="player-page container text-center">
        <div className="glass-panel error-card mx-auto" style={{maxWidth: '500px', marginTop: '100px'}}>
          <AlertCircle className="text-error mx-auto mb-4" size={48} />
          <h2 className="mb-4">Oops!</h2>
          <p className="text-muted mb-6">{error}</p>
          <button className="btn btn-primary" onClick={loadNextQuestion}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!question && !error) {
    return (
      <div className="player-page container flex-center" style={{minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <Loader2 className="spinner text-primary" size={48} />
      </div>
    );
  }

  // Calculate difficulty color
  const getDiffColor = (diff) => {
    if (diff === 'easy') return 'var(--success)';
    if (diff === 'medium') return 'var(--warning)';
    return 'var(--error)';
  };

  return (
    <div className="player-page">
      <div className="container player-container">
        
        {/* Top Bar: Progress & Mastery */}
        <div className="player-top-bar glass-panel">
          <div className="progress-indicator">
            <span className="text-sm text-muted">Question {progress.current} of {progress.total}</span>
            <div className="progress-bar-bg w-100 mt-2" style={{ height: '6px', width: '100%' }}>
              <div 
                className="progress-bar-fill" 
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>

          <div className="difficulty-indicator">
            <div className="pulse-dot" style={{ backgroundColor: getDiffColor(progress.difficulty) }} />
            <span style={{ color: getDiffColor(progress.difficulty), textTransform: 'uppercase', fontWeight: 800 }}>
              {progress.difficulty}
            </span>
            <span className="text-muted ml-2">&middot; {question.subtopic}</span>
          </div>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={question.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="question-card glass-panel"
          >
            <h2 className="question-text">{question.question}</h2>

            <div className="options-grid">
              {question.options.map((opt, idx) => {
                let stateClass = '';
                if (result) {
                  if (idx === result.correctAnswer) stateClass = 'correct';
                  else if (idx === selectedOption) stateClass = 'incorrect';
                  else stateClass = 'disabled';
                } else if (idx === selectedOption) {
                  stateClass = 'selected';
                }

                return (
                  <button
                    key={idx}
                    className={`option-btn ${stateClass}`}
                    onClick={() => !result && setSelectedOption(idx)}
                    disabled={!!result || isSubmitting}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                    <span className="option-text">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Answer Actions */}
            <div className="answer-actions">
              {!result ? (
                <button 
                  className="btn btn-main btn-glow" 
                  onClick={handleSubmit}
                  disabled={selectedOption === null || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="spinner" size={20} /> : 'Submit Answer'}
                </button>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="explanation-box"
                >
                  <div className={`result-badge ${result.isCorrect ? 'bg-success' : 'bg-error'}`}>
                    {result.isCorrect ? 'Correct!' : 'Incorrect'}
                  </div>
                  <p className="explanation-text">{result.explanation}</p>
                  
                  <div className="engine-insight glass-panel">
                    <Zap size={16} className="text-primary" />
                    <span>
                      Engine adapting: Mastery in <strong>{question.subtopic}</strong> is now {Math.round(mastery[question.subtopic] || 50)}%.
                      Next question will be {result.nextDifficulty}.
                    </span>
                  </div>

                  <button className="btn btn-main mt-4" onClick={loadNextQuestion}>
                    {progress.current === progress.total ? 'View Report' : 'Next Question'} <ArrowRight size={18} />
                  </button>
                </motion.div>
              )}
            </div>

          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
