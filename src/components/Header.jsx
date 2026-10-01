import React from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit } from 'lucide-react';
import './Header.css';

export default function Header() {
  return (
    <header className="cortex-header">
      <div className="container header-container">
        <Link to="/" className="logo">
          <BrainCircuit className="logo-icon" size={28} />
          <span className="logo-text">Cortex</span>
        </Link>
        <nav className="header-nav">
          <Link to="/create" className="btn btn-primary glass-panel">
            Create Quiz
          </Link>
        </nav>
      </div>
    </header>
  );
}
