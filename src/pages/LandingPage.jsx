import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Zap, Target, BarChart3, ChevronRight } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="container hero-container">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="hero-content"
          >
            <div className="badge glass-panel">
              <Brain size={16} className="text-secondary" />
              <span>Adaptive learning engine</span>
            </div>
            
            <h1 className="hero-title">
              Turn your study material into an <br />
              <span className="text-gradient highlight-glow">adaptive challenge.</span>
            </h1>
            
            <p className="hero-subtitle">
              AI generates questions from what you're actually learning — then continuously adjusts the challenge based on how you perform.
            </p>
            
            <div className="hero-actions">
              <Link to="/create" className="btn btn-main btn-glow">
                Create My Quiz <ChevronRight size={18} />
              </Link>
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="hero-visual"
          >
            <div className="neural-sphere-container">
              {/* Decorative background glow */}
              <div className="glow-orb primary-orb"></div>
              <div className="glow-orb secondary-orb"></div>
              
              <div className="glass-panel abstract-card floating-1">
                <div className="card-header">
                  <div className="dot red"></div>
                  <div className="dot yellow"></div>
                  <div className="dot green"></div>
                </div>
                <div className="card-body">
                  <div className="skeleton-line long"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line short"></div>
                </div>
              </div>
              
              <div className="glass-panel abstract-card floating-2">
                <div className="stat-row">
                  <Target size={20} className="text-primary" />
                  <span>Mastery</span>
                  <span className="stat-value text-primary">82%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{width: '82%'}}></div>
                </div>
              </div>
              
              <div className="glass-panel abstract-card floating-3">
                <div className="difficulty-badge hard">HARD</div>
                <div className="skeleton-line full"></div>
                <div className="skeleton-line"></div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features" id="how">
        <div className="container">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="section-header"
          >
            <h2 className="section-title">Four steps. <span className="text-gradient">One loop.</span></h2>
            <p className="section-subtitle">AI doesn't just grade you. It diagnoses how you think.</p>
          </motion.div>

          <div className="features-grid">
            <FeatureCard 
              icon={<Brain size={24} />}
              title="Concept Detection"
              description="Reads your material and maps it into a structured knowledge graph."
              delay={0.1}
            />
            <FeatureCard 
              icon={<Zap size={24} />}
              title="Question Generation"
              description="Builds unique multiple-choice questions targeting your specific material."
              delay={0.2}
            />
            <FeatureCard 
              icon={<Target size={24} />}
              title="Difficulty Adaptation"
              description="Raises or lowers the challenge after each answer to keep you in flow."
              delay={0.3}
            />
            <FeatureCard 
              icon={<BarChart3 size={24} />}
              title="Learning Diagnosis"
              description="Finds why you missed — not just what. Pinpoints exact concept gaps."
              delay={0.4}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="feature-card glass-panel hover-lift"
    >
      <div className="feature-icon-wrapper">
        {icon}
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-description">{description}</p>
    </motion.div>
  );
}
