import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Pages
import LandingPage from './pages/LandingPage';
import CreateQuizPage from './pages/CreateQuizPage';
import QuizProcessingPage from './pages/QuizProcessingPage';
import QuizPlayerPage from './pages/QuizPlayerPage';
import PerformanceReportPage from './pages/PerformanceReportPage';

// Components
import Header from './components/Header';

function App() {
  return (
    <BrowserRouter>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/create" element={<CreateQuizPage />} />
          <Route path="/processing/:quizId" element={<QuizProcessingPage />} />
          <Route path="/quiz/:quizId" element={<QuizPlayerPage />} />
          <Route path="/report/:quizId" element={<PerformanceReportPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
