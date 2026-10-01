import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, Target, Brain, TrendingUp, TrendingDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { api } from '../lib/api';
import './PerformanceReportPage.css';

export default function PerformanceReportPage() {
  const { quizId } = useParams();
  
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        // Complete the quiz first to ensure report is generated
        await api.completeQuiz(quizId).catch(() => {});
        
        // Then fetch it
        const data = await api.getReport(quizId);
        setReport(data);
      } catch (err) {
        setError(err.message || 'Failed to load performance report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [quizId]);

  if (loading) {
    return (
      <div className="report-page container flex-center">
        <div className="text-center">
          <Loader2 className="spinner text-primary mx-auto mb-4" size={48} />
          <h3 className="text-muted">Cortex is generating your insight report...</h3>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="report-page container text-center">
        <div className="glass-panel error-card mx-auto mt-10">
          <AlertCircle className="text-error mx-auto mb-4" size={48} />
          <h2 className="mb-4">Report Unavailable</h2>
          <p className="text-muted mb-6">{error}</p>
          <Link to="/" className="btn btn-primary">Go Home</Link>
        </div>
      </div>
    );
  }

  // Format data for radar chart
  const radarData = Object.entries(report.topicPerformance).map(([subject, score]) => ({
    subject: subject.length > 15 ? subject.substring(0, 15) + '...' : subject,
    score,
    fullMark: 100,
  }));

  return (
    <div className="report-page">
      <div className="container">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="report-header text-center"
        >
          <div className="badge glass-panel mb-4">
            <Award size={16} className="text-primary" />
            <span>Learning Session Complete</span>
          </div>
          <h1 className="section-title">Performance Intelligence</h1>
          <p className="section-subtitle">Here is exactly where you stand and what Cortex recommends next.</p>
        </motion.div>

        <div className="report-grid">
          
          {/* Main KPI Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="glass-panel kpi-card"
          >
            <div className="kpi-item">
              <span className="kpi-label">Overall Mastery</span>
              <span className="kpi-value text-gradient">{report.accuracy}%</span>
            </div>
            <div className="kpi-divider"></div>
            <div className="kpi-stats">
              <div className="stat">
                <span className="text-muted text-sm">Correct</span>
                <span className="text-success font-bold text-lg">{report.correctAnswers}</span>
              </div>
              <div className="stat">
                <span className="text-muted text-sm">Incorrect</span>
                <span className="text-error font-bold text-lg">{report.incorrectAnswers}</span>
              </div>
              <div className="stat">
                <span className="text-muted text-sm">Avg Difficulty</span>
                <span className="text-warning font-bold text-lg" style={{textTransform: 'capitalize'}}>{report.avgDifficulty}</span>
              </div>
            </div>
          </motion.div>

          {/* AI Learning Insight */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel insight-card"
          >
            <h3 className="card-title flex items-center gap-2 mb-4">
              <Brain className="text-primary" size={24} /> 
              Cortex Diagnosis
            </h3>
            <p className="insight-text">"{report.aiInsight}"</p>
          </motion.div>

          {/* Radar Chart (Knowledge Map) */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel chart-card"
          >
            <h3 className="card-title mb-2">Topic Knowledge Map</h3>
            <div className="chart-container">
              {radarData.length > 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      name="Mastery"
                      dataKey="score"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-center h-100 text-muted">
                  Not enough topics to map.
                </div>
              )}
            </div>
          </motion.div>

          {/* Strengths & Weaknesses */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel sw-card"
          >
            <div className="sw-section mb-6">
              <h4 className="flex items-center gap-2 text-success mb-3">
                <TrendingUp size={18} /> Established Strengths
              </h4>
              <ul className="sw-list">
                {report.strengths.slice(0,3).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            
            <div className="sw-section">
              <h4 className="flex items-center gap-2 text-error mb-3">
                <TrendingDown size={18} /> Priority Gaps
              </h4>
              <ul className="sw-list">
                {report.weaknesses.slice(0,3).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Recommendations */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel recommendations-card"
          >
            <h3 className="card-title flex items-center gap-2 mb-4">
              <Target className="text-secondary" size={24} /> 
              Next Best Steps
            </h3>
            <div className="recommendations-list">
              {report.recommendations.map((rec, i) => (
                <div key={i} className="rec-item">
                  <div className="rec-number">{i + 1}</div>
                  <p>{rec}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-8 text-center">
              <Link to="/create" className="btn btn-main btn-glow">
                Start New Session <ChevronRight size={18} />
              </Link>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
