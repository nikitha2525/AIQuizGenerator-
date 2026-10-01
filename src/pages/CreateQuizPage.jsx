import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Type, FileText, AlertCircle, Loader2, Brain } from 'lucide-react';
import { api } from '../lib/api';
import './CreateQuizPage.css';

export default function CreateQuizPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('topic'); // 'topic' or 'file'
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState(null);
  const [questionCount, setQuestionCount] = useState(10);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf' && selectedFile.type !== 'text/plain') {
        setError('Please upload a PDF or TXT file.');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File must be less than 10MB.');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      fileInputRef.current.files = e.dataTransfer.files;
      handleFileChange({ target: { files: [droppedFile] } });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (activeTab === 'topic') {
        if (!topic.trim()) throw new Error('Please enter a topic');
        const res = await api.createQuiz('topic', topic, questionCount);
        navigate(`/processing/${res.quizId}`);
      } else {
        if (!file) throw new Error('Please upload a file');
        
        // 1. Upload file and extract text
        const uploadRes = await api.uploadMaterial(file);
        
        // 2. Create quiz from extracted text
        const res = await api.createQuiz('material', uploadRes.text, questionCount);
        navigate(`/processing/${res.quizId}`);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="create-page">
      <div className="container">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="create-header text-center"
        >
          <h1 className="section-title">What are you learning?</h1>
          <p className="section-subtitle">Give Cortex a topic or upload your study material, and it will generate an adaptive challenge for you.</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="create-container"
        >
          <div className="glass-panel create-card">
            
            <div className="tabs">
              <button 
                className={`tab-btn ${activeTab === 'topic' ? 'active' : ''}`}
                onClick={() => { setActiveTab('topic'); setError(null); }}
              >
                <Type size={18} /> Enter a Topic
              </button>
              <button 
                className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
                onClick={() => { setActiveTab('file'); setError(null); }}
              >
                <Upload size={18} /> Upload Material
              </button>
            </div>

            {error && (
              <div className="error-alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="create-form">
              
              {activeTab === 'topic' ? (
                <div className="form-group">
                  <label htmlFor="topic-input">What do you want to master?</label>
                  <input
                    id="topic-input"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Machine Learning, React Native, Human Anatomy..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                  <p className="input-hint">Be as specific or general as you like.</p>
                </div>
              ) : (
                <div className="form-group">
                  <label>Upload Study Notes or Document</label>
                  <div 
                    className={`file-drop-area ${file ? 'has-file' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".pdf,.txt"
                      style={{ display: 'none' }}
                    />
                    
                    {file ? (
                      <div className="file-info">
                        <FileText size={32} className="text-primary" />
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        <button type="button" className="btn-text" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="upload-prompt">
                        <Upload size={32} className="text-muted" />
                        <span>Drag & drop a file here, or click to browse</span>
                        <span className="text-muted text-sm">Supports PDF and TXT (Max 10MB)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="question-count">Number of Questions</label>
                <div className="count-selector">
                  {[5, 10, 15, 20].map(num => (
                    <button
                      key={num}
                      type="button"
                      className={`count-btn ${questionCount === num ? 'active' : ''}`}
                      onClick={() => setQuestionCount(num)}
                      disabled={isLoading}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-main btn-glow submit-btn"
                  disabled={isLoading || (activeTab === 'topic' ? !topic.trim() : !file)}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={20} className="spinner" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain size={20} />
                      Generate Quiz
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
