import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, BrainCircuit, FileSearch, Network, PenTool } from 'lucide-react';
import { api } from '../lib/api';
import './QuizProcessingPage.css';

const STAGES = {
  'analyzing': { icon: FileSearch, text: 'Analyzing material...' },
  'extracting_topics': { icon: Network, text: 'Extracting topics...' },
  'extracting_concepts': { icon: BrainCircuit, text: 'Building knowledge map...' },
  'generating_questions': { icon: PenTool, text: 'Generating adaptive questions...' },
  'preparing_engine': { icon: Loader2, text: 'Preparing adaptive engine...' },
  'ready': { icon: CheckCircle2, text: 'Quiz ready.' }
};

export default function QuizProcessingPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let intervalId;

    const pollStatus = async () => {
      try {
        const data = await api.getQuizStatus(quizId);
        setStatus(data);

        if (data.status === 'ready') {
          clearInterval(intervalId);
          // Wait a moment so user can see "100%" and "Ready" before redirecting
          setTimeout(() => {
            navigate(`/quiz/${quizId}`);
          }, 1500);
        } else if (data.status === 'error') {
          clearInterval(intervalId);
          setError(data.error || 'Failed to process quiz');
        }
      } catch (err) {
        console.error(err);
        clearInterval(intervalId);
        setError('Connection lost. Could not verify quiz status.');
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, 2000); // Poll every 2s

    return () => clearInterval(intervalId);
  }, [quizId, navigate]);

  if (error) {
    return (
      <div className="processing-page">
        <div className="container text-center">
          <div className="glass-panel error-card">
            <h2 className="text-error mb-4">Processing Failed</h2>
            <p className="text-muted mb-6">{error}</p>
            <button className="btn btn-primary" onClick={() => navigate('/create')}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStageInfo = STAGES[status?.stage] || STAGES.analyzing;
  const CurrentIcon = currentStageInfo.icon;
  const progress = status?.progress || 0;

  return (
    <div className="processing-page">
      <div className="container processing-container">
        <div className="glass-panel processing-card text-center">
          
          <motion.div 
            className="icon-container"
            animate={{ 
              rotate: status?.stage === 'ready' ? 0 : 360,
              scale: status?.stage === 'ready' ? [1, 1.2, 1] : 1
            }}
            transition={{ 
              rotate: { duration: 8, repeat: Infinity, ease: "linear" },
              scale: { duration: 0.5 }
            }}
          >
            <div className="icon-glow"></div>
            <CurrentIcon size={48} className={status?.stage === 'ready' ? 'text-success' : 'text-primary'} />
          </motion.div>

          <h2 className="processing-title">
            {currentStageInfo.text}
          </h2>

          <div className="progress-container">
            <div className="progress-bar-bg">
              <motion.div 
                className="progress-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
                style={{ 
                  background: status?.stage === 'ready' 
                    ? 'var(--success)' 
                    : 'linear-gradient(90deg, var(--primary), var(--secondary))' 
                }}
              />
            </div>
            <div className="progress-text">{progress}%</div>
          </div>

          <div className="topics-preview">
            {status?.topics?.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="extracted-content"
              >
                <p className="text-sm text-muted mb-3">Extracted concepts:</p>
                <div className="tags-container">
                  {status.topics.map(t => (
                    t.concepts.map(c => (
                      <span key={c} className="tag glass-panel">{c}</span>
                    ))
                  )).flat().slice(0, 8)}
                  {status.topics.reduce((acc, t) => acc + t.concepts.length, 0) > 8 && (
                    <span className="tag glass-panel">...and more</span>
                  )}
                </div>
              </motion.div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
