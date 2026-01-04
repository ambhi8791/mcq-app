// Main App Controller
class MCQApp {
    constructor() {
        this.currentView = 'home';
        this.questionsPerQuiz = 25;
        this.timerDuration = 10 * 60; // 10 minutes
        this.cooldownHours = 2;
        
        this.initializeApp();
    }

    async initializeApp() {
        console.log('Initializing MCQ App...');
        
        // Initialize database
        await mcqDB.init();
        
        // Setup navigation
        this.setupNavigation();
        
        // Load home view
        await this.showView('home');
        
        // Request notification permission
        this.requestNotificationPermission();
        
        console.log('App initialized');
    }

    setupNavigation() {
        // Handle navigation clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-view]')) {
                const view = e.target.closest('[data-view]').getAttribute('data-view');
                this.showView(view);
            }
            
            if (e.target.closest('[data-action]')) {
                const action = e.target.closest('[data-action]').getAttribute('data-action');
                this.handleAction(action);
            }
        });
        
        // Handle hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1) || 'home';
            this.showView(hash, false);
        });
    }

    async showView(viewName, updateHash = true) {
        this.currentView = viewName;
        
        // Update URL
        if (updateHash) {
            window.location.hash = viewName;
        }
        
        // Hide all views
        document.querySelectorAll('[data-view-container]').forEach(el => {
            el.style.display = 'none';
        });
        
        // Show selected view
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.style.display = 'block';
            this.updateActiveNav(viewName);
            await this.loadViewData(viewName);
        }
    }

    updateActiveNav(viewName) {
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-view') === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    async loadViewData(viewName) {
        switch(viewName) {
            case 'home':
                await this.loadHomeData();
                break;
            case 'quiz':
                await this.startQuiz();
                break;
            case 'progress':
                await this.loadProgressData();
                break;
            case 'import':
                await this.loadImportView();
                break;
        }
    }

    async loadHomeData() {
        try {
            const stats = await mcqDB.getProgressStats();
            this.renderHomeStats(stats);
        } catch (error) {
            console.error('Error loading home data:', error);
        }
    }

    renderHomeStats(stats) {
        // Update stat values
        document.getElementById('total-questions').textContent = stats.totalQuestions;
        document.getElementById('coverage').textContent = `${stats.coverage}%`;
        document.getElementById('accuracy').textContent = `${stats.accuracy}%`;
        document.getElementById('quizzes-taken').textContent = stats.quizHistory.length;
        document.getElementById('total-attempted').textContent = stats.totalAsked;
        document.getElementById('total-correct').textContent = stats.totalCorrect;
        
        // Update progress bars
        document.getElementById('coverage-bar').style.width = `${stats.coverage}%`;
        document.getElementById('accuracy-bar').style.width = `${stats.accuracy}%`;
        
        // Update percentages
        document.getElementById('coverage-percent').textContent = `${stats.coverage}%`;
        document.getElementById('accuracy-percent').textContent = `${stats.accuracy}%`;
        
        // Calculate readiness score
        const readinessScore = Math.min(100, Math.round((stats.accuracy * 0.6) + (stats.coverage * 0.4)));
        document.getElementById('readiness-score').textContent = `${readinessScore}%`;
        
        // Update quiz button based on cooldown
        this.updateQuizButton();
        
        // Render recent quizzes
        this.renderRecentQuizzes(stats.quizHistory);
    }

    updateQuizButton() {
        const lastQuizTime = localStorage.getItem('lastQuizTime');
        const quizButton = document.getElementById('start-quiz-btn');
        
        if (!lastQuizTime) {
            quizButton.disabled = false;
            quizButton.innerHTML = '🎯 Start New Quiz (25 Questions)';
            quizButton.onclick = () => this.showView('quiz');
            return;
        }
        
        const cooldown = this.cooldownHours * 60 * 60 * 1000;
        const timeSinceLastQuiz = Date.now() - parseInt(lastQuizTime);
        
        if (timeSinceLastQuiz >= cooldown) {
            quizButton.disabled = false;
            quizButton.innerHTML = '🎯 Start New Quiz (25 Questions)';
            quizButton.onclick = () => this.showView('quiz');
        } else {
            const timeLeft = cooldown - timeSinceLastQuiz;
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            
            quizButton.disabled = true;
            quizButton.innerHTML = `⏳ Next quiz in ${hours}h ${minutes}m`;
        }
    }

    renderRecentQuizzes(quizzes) {
        const container = document.getElementById('recent-quizzes-list');
        if (!container) return;
        
        if (quizzes.length === 0) {
            container.innerHTML = '<p class="empty-state">No quizzes taken yet</p>';
            return;
        }
        
        const html = quizzes.slice(0, 5).map(quiz => `
            <div class="quiz-history-item">
                <div class="quiz-date">${new Date(quiz.date).toLocaleDateString()}</div>
                <div class="quiz-score">${quiz.score}/${quiz.total} (${quiz.percentage}%)</div>
                <div class="quiz-duration">${quiz.duration || '10:00'}</div>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }

    async startQuiz() {
        // Check cooldown
        const lastQuizTime = localStorage.getItem('lastQuizTime');
        if (lastQuizTime) {
            const cooldown = this.cooldownHours * 60 * 60 * 1000;
            const timeSinceLastQuiz = Date.now() - parseInt(lastQuizTime);
            
            if (timeSinceLastQuiz < cooldown) {
                const timeLeft = cooldown - timeSinceLastQuiz;
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                
                alert(`Please wait ${hours}h ${minutes}m before taking another quiz.`);
                this.showView('home');
                return;
            }
        }
        
        // Get random questions
        const questions = await mcqDB.getRandomQuestions(this.questionsPerQuiz);
        
        if (questions.length === 0) {
            alert('No questions found. Please import questions first.');
            this.showView('import');
            return;
        }
        
        // Initialize quiz state
        window.currentQuiz = {
            questions: questions,
            currentIndex: 0,
            answers: {},
            startTime: Date.now(),
            timer: null
        };
        
        // Start timer
        this.startTimer();
        
        // Render first question
        this.renderQuestion(0);
        
        // Generate question indicators
        this.renderQuestionIndicators();
        
        // Update progress
        this.updateQuizProgress();
    }

    renderQuestion(index) {
        const quiz = window.currentQuiz;
        if (!quiz || !quiz.questions[index]) return;
        
        const question = quiz.questions[index];
        const container = document.getElementById('question-container');
        
        // Build question HTML
        const html = `
            <div class="question-card" data-question-id="${question.id}">
                <div class="question-number">Q${index + 1}</div>
                <div class="question-text">${question.question}</div>
                
                ${question.explanation ? `
                    <div class="explanation-toggle">
                        <button onclick="app.toggleExplanation(${question.id})" class="btn small">
                            💡 Show Explanation
                        </button>
                        <div class="explanation" id="explanation-${question.id}" style="display: none;">
                            ${question.explanation}
                        </div>
                    </div>
                ` : `
                    <div class="add-explanation">
                        <button onclick="app.showAddExplanationForm(${question.id})" class="btn small">
                            ✏️ Add Explanation
                        </button>
                    </div>
                `}
                
                <div class="options-grid">
                    ${['A', 'B', 'C', 'D'].map(option => `
                        <label class="option ${quiz.answers[question.id] === option ? 'selected' : ''}">
                            <input type="radio" 
                                   name="q${question.id}" 
                                   value="${option}"
                                   ${quiz.answers[question.id] === option ? 'checked' : ''}
                                   onchange="app.selectAnswer(${question.id}, '${option}')">
                            <span class="option-label">${option}</span>
                            <span class="option-text">${question['option' + option]}</span>
                        </label>
                    `).join('')}
                </div>
                
                <div class="question-stats">
                    <span>📊 Asked: ${question.timesAsked || 0} times</span>
                    <span>✅ Correct: ${question.timesCorrect || 0} times</span>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Update current index
        quiz.currentIndex = index;
        
        // Update question counter
        document.getElementById('current-question-counter').textContent = 
            `${index + 1} of ${quiz.questions.length}`;
        
        // Update navigation buttons
        this.updateQuizNavigation(index);
    }

    renderQuestionIndicators() {
        const quiz = window.currentQuiz;
        const container = document.getElementById('question-indicators');
        
        const indicators = quiz.questions.map((q, i) => {
            let className = 'question-indicator';
            if (i === quiz.currentIndex) className += ' current';
            if (quiz.answers[q.id]) className += ' answered';
            
            return `<div class="${className}" onclick="app.goToQuestion(${i})">${i + 1}</div>`;
        }).join('');
        
        container.innerHTML = indicators;
    }

    updateQuizNavigation(index) {
        const prevBtn = document.getElementById('prev-question-btn');
        const nextBtn = document.getElementById('next-question-btn');
        
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === window.currentQuiz.questions.length - 1;
    }

    updateQuizProgress() {
        const quiz = window.currentQuiz;
        const answered = Object.keys(quiz.answers).length;
        const progress = (answered / quiz.questions.length) * 100;
        
        document.getElementById('answered-counter').textContent = answered;
        document.getElementById('total-questions-counter').textContent = quiz.questions.length;
        document.getElementById('quiz-progress-text').textContent = `${Math.round(progress)}%`;
        document.getElementById('quiz-progress-bar').style.width = `${progress}%`;
    }

    selectAnswer(questionId, answer) {
        if (!window.currentQuiz) return;
        
        window.currentQuiz.answers[questionId] = answer;
        this.updateQuizProgress();
        this.renderQuestionIndicators();
    }

    goToQuestion(index) {
        if (window.currentQuiz) {
            this.renderQuestion(index);
        }
    }

    nextQuestion() {
        if (window.currentQuiz && window.currentQuiz.currentIndex < window.currentQuiz.questions.length - 1) {
            this.renderQuestion(window.currentQuiz.currentIndex + 1);
        }
    }

    prevQuestion() {
        if (window.currentQuiz && window.currentQuiz.currentIndex > 0) {
            this.renderQuestion(window.currentQuiz.currentIndex - 1);
        }
    }

    startTimer() {
        let timeLeft = this.timerDuration;
        const timerElement = document.getElementById('quiz-timer');
        
        // Clear existing timer
        if (window.currentQuiz.timer) {
            clearInterval(window.currentQuiz.timer);
        }
        
        // Update timer every second
        window.currentQuiz.timer = setInterval(() => {
            timeLeft--;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Color coding
            if (timeLeft < 60) {
                timerElement.style.color = '#f56565';
            } else if (timeLeft < 180) {
                timerElement.style.color = '#ed8936';
            }
            
            if (timeLeft <= 0) {
                clearInterval(window.currentQuiz.timer);
                this.submitQuiz();
            }
        }, 1000);
    }

    async submitQuiz() {
        if (!window.currentQuiz) return;
        
        // Stop timer
        if (window.currentQuiz.timer) {
            clearInterval(window.currentQuiz.timer);
        }
        
        const quiz = window.currentQuiz;
        const results = {
            score: 0,
            total: quiz.questions.length,
            questions: []
        };
        
        // Calculate score
        for (const question of quiz.questions) {
            const userAnswer = quiz.answers[question.id];
            const isCorrect = userAnswer === question.correctAnswer;
            
            if (isCorrect) results.score++;
            
            results.questions.push({
                id: question.id,
                question: question.question,
                userAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect,
                explanation: question.explanation
            });
            
            // Update performance
            await mcqDB.updateQuestionPerformance(question.id, isCorrect);
        }
        
        results.percentage = Math.round((results.score / results.total) * 100);
        results.duration = this.formatDuration(Date.now() - quiz.startTime);
        
        // Save quiz result
        await mcqDB.saveQuizResult(results);
        
        // Update last quiz time
        localStorage.setItem('lastQuizTime', Date.now());
        
        // Show results
        this.showResults(results);
    }

    showResults(results) {
        const html = `
            <div class="results-container">
                <div class="results-header">
                    <h1>🎯 Quiz Completed!</h1>
                    <p>${this.getResultsMessage(results.percentage)}</p>
                </div>
                
                <div class="score-display">
                    <div class="score-circle" style="background: ${this.getScoreColor(results.percentage)}">
                        ${results.percentage}%
                    </div>
                    <h2>${results.score} / ${results.total} Correct</h2>
                    <p>⏱️ ${results.duration}</p>
                </div>
                
                <div class="results-breakdown">
                    <div class="breakdown-item correct">
                        <span class="breakdown-label">Correct</span>
                        <span class="breakdown-value">${results.score}</span>
                    </div>
                    <div class="breakdown-item incorrect">
                        <span class="breakdown-label">Incorrect</span>
                        <span class="breakdown-value">${results.total - results.score}</span>
                    </div>
                    <div class="breakdown-item skipped">
                        <span class="breakdown-label">Unanswered</span>
                        <span class="breakdown-value">${results.total - Object.keys(window.currentQuiz.answers).length}</span>
                    </div>
                </div>
                
                <div class="detailed-review">
                    <h3>📋 Question Review</h3>
                    ${results.questions.map((q, i) => `
                        <div class="review-item ${q.isCorrect ? 'correct' : 'incorrect'}">
                            <div class="review-question">
                                <strong>Q${i + 1}:</strong> ${q.question}
                            </div>
                            <div class="review-answer">
                                <span class="user-answer ${q.isCorrect ? 'correct' : 'incorrect'}">
                                    Your answer: ${q.userAnswer || 'Not answered'}
                                </span>
                                ${!q.isCorrect ? `
                                    <span class="correct-answer">
                                        Correct answer: ${q.correctAnswer}
                                    </span>
                                ` : ''}
                            </div>
                            ${q.explanation ? `
                                <div class="explanation">
                                    <strong>Explanation:</strong> ${q.explanation}
                                </div>
                            ` : `
                                <div class="add-explanation-review">
                                    <button onclick="app.showAddExplanationForm(${q.id}, true)" class="btn small">
                                        ✏️ Add explanation
                                    </button>
                                </div>
                            `}
                        </div>
                    `).join('')}
                </div>
                
                <div class="results-actions">
                    <button class="btn primary" onclick="app.showView('quiz')">
                        🔄 Take Another Quiz
                    </button>
                    <button class="btn secondary" onclick="app.showView('progress')">
                        📊 View Progress
                    </button>
                    <button class="btn" onclick="app.showView('home')">
                        🏠 Back to Home
                    </button>
                </div>
            </div>
        `;
        
        // Update results view
        const resultsView = document.getElementById('results-view');
        resultsView.innerHTML = html;
        
        // Switch to results view
        this.showView('results');
    }

    getResultsMessage(percentage) {
        if (percentage >= 90) return 'Outstanding! You are exam-ready! 🎉';
        if (percentage >= 75) return 'Great job! Keep it up! 👍';
        if (percentage >= 60) return 'Good effort! Practice more. 📚';
        if (percentage >= 40) return 'Needs improvement. Review explanations. 🔍';
        return 'Needs more practice. Focus on understanding. 💪';
    }

    getScoreColor(percentage) {
        if (percentage >= 90) return 'linear-gradient(135deg, #48bb78, #38a169)';
        if (percentage >= 75) return 'linear-gradient(135deg, #4299e1, #3182ce)';
        if (percentage >= 60) return 'linear-gradient(135deg, #ed8936, #dd6b20)';
        return 'linear-gradient(135deg, #f56565, #e53e3e)';
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    async loadProgressData() {
        try {
            const stats = await mcqDB.getProgressStats();
            this.renderProgressView(stats);
        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    renderProgressView(stats) {
        const progressView = document.getElementById('progress-view');
        
        const html = `
            <div class="progress-container">
                <div class="progress-header">
                    <h1>📈 Progress Analytics</h1>
                    <p>Track your learning journey</p>
                </div>
                
                <div class="progress-stats">
                    <div class="progress-stat">
                        <div class="stat-value">${stats.totalQuestions}</div>
                        <div class="stat-label">Total Questions</div>
                    </div>
                    <div class="progress-stat">
                        <div class="stat-value">${stats.coverage}%</div>
                        <div class="stat-label">Coverage</div>
                    </div>
                    <div class="progress-stat">
                        <div class="stat-value">${stats.accuracy}%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                    <div class="progress-stat">
                        <div class="stat-value">${stats.quizHistory.length}</div>
                        <div class="stat-label">Quizzes Taken</div>
                    </div>
                </div>
                
                <div class="quiz-history">
                    <h3>📋 Quiz History</h3>
                    ${stats.quizHistory.length > 0 ? `
                        <table class="quiz-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Score</th>
                                    <th>Percentage</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.quizHistory.map(quiz => `
                                    <tr>
                                        <td>${new Date(quiz.date).toLocaleDateString()}</td>
                                        <td>${quiz.score}/${quiz.total}</td>
                                        <td>
                                            <span class="percentage-badge ${quiz.percentage >= 80 ? 'excellent' : 
                                                quiz.percentage >= 60 ? 'good' : 'needs-improvement'}">
                                                ${quiz.percentage}%
                                            </span>
                                        </td>
                                        <td>${quiz.duration || '10:00'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <p class="empty-state">No quiz history yet</p>
                    `}
                </div>
                
                <div class="progress-actions">
                    <button class="btn" onclick="app.showView('home')">🏠 Back to Home</button>
                </div>
            </div>
        `;
        
        progressView.innerHTML = html;
    }

    async loadImportView() {
        const importView = document.getElementById('import-view');
        
        const html = `
            <div class="import-container">
                <h1>📥 Import Questions</h1>
                <p>Upload CSV files with your questions</p>
                
                <div class="import-format">
                    <h3>Required CSV Format:</h3>
                    <pre>Question,OptionA,OptionB,OptionC,OptionD,Correct Answer,Explanation (optional)</pre>
                    <p>Note: First row should contain headers</p>
                </div>
                
                <div class="import-area">
                    <input type="file" id="csv-file" accept=".csv" multiple>
                    <label for="csv-file" class="file-drop-zone">
                        📁 Drop CSV files here or click to select
                    </label>
                    
                    <div class="category-input">
                        <label for="import-category">Category (optional):</label>
                        <input type="text" id="import-category" placeholder="e.g., Physics, Chemistry">
                    </div>
                    
                    <button class="btn primary" onclick="app.processImport()">
                        🚀 Start Import
                    </button>
                    
                    <div class="import-progress" id="import-progress" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-fill" id="import-progress-bar"></div>
                        </div>
                        <div class="progress-text" id="import-progress-text">0%</div>
                    </div>
                    
                    <div class="import-results" id="import-results"></div>
                </div>
                
                <div class="sample-download">
                    <h4>Need a sample file?</h4>
                    <button class="btn secondary" onclick="app.downloadSampleCSV()">
                        📥 Download Sample CSV
                    </button>
                </div>
            </div>
        `;
        
        importView.innerHTML = html;
    }

    async processImport() {
        const fileInput = document.getElementById('csv-file');
        const category = document.getElementById('import-category').value || 'default';
        
        if (!fileInput.files.length) {
            alert('Please select CSV files first');
            return;
        }
        
        const resultsEl = document.getElementById('import-results');
        const progressEl = document.getElementById('import-progress');
        const progressBar = document.getElementById('import-progress-bar');
        const progressText = document.getElementById('import-progress-text');
        
        progressEl.style.display = 'block';
        resultsEl.innerHTML = '<p>Starting import...</p>';
        
        let totalImported = 0;
        
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            
            try {
                const text = await this.readFile(file);
                const result = await mcqDB.importCSV(text, category);
                
                totalImported += result.added;
                
                // Update progress
                const percent = ((i + 1) / fileInput.files.length) * 100;
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `${Math.round(percent)}%`;
                
                resultsEl.innerHTML += `<p>✅ ${file.name}: Imported ${result.added} questions</p>`;
                
            } catch (error) {
                resultsEl.innerHTML += `<p>❌ ${file.name}: Error - ${error.message}</p>`;
            }
        }
        
        resultsEl.innerHTML += `<p><strong>Total imported: ${totalImported} questions</strong></p>`;
        
        if (totalImported > 0) {
            resultsEl.innerHTML += `
                <button class="btn success" onclick="app.showView('home')">
                    🎉 Start Practicing!
                </button>
            `;
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    downloadSampleCSV() {
        const sample = `Question,OptionA,OptionB,OptionC,OptionD,Correct Answer,Explanation
"What is the capital of France?","Paris","London","Berlin","Madrid","A","Paris is the capital and most populous city of France."
"Which planet is known as the Red Planet?","Mars","Venus","Jupiter","Saturn","A","Mars appears red due to iron oxide on its surface."
"What is 2 + 2?","3","4","5","6","B","Basic arithmetic addition."`;
        
        const blob = new Blob([sample], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mcq_sample.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    toggleExplanation(questionId) {
        const explanation = document.getElementById(`explanation-${questionId}`);
        if (explanation) {
            explanation.style.display = explanation.style.display === 'none' ? 'block' : 'none';
        }
    }

    showAddExplanationForm(questionId) {
        const modal = `
            <div class="modal">
                <div class="modal-content">
                    <h3>Add Explanation</h3>
                    <textarea id="explanation-text" placeholder="Enter explanation..."></textarea>
                    <div class="modal-actions">
                        <button class="btn" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button class="btn primary" onclick="app.saveExplanation(${questionId})">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modal);
    }

    async saveExplanation(questionId) {
        const text = document.getElementById('explanation-text').value;
        
        if (!text.trim()) {
            alert('Please enter an explanation');
            return;
        }
        
        await mcqDB.updateQuestionExplanation(questionId, text);
        
        // Remove modal
        document.querySelector('.modal').remove();
        
        // Refresh current view
        if (window.currentQuiz) {
            this.renderQuestion(window.currentQuiz.currentIndex);
        }
    }

    handleAction(action) {
        switch(action) {
            case 'start-quiz':
                this.showView('quiz');
                break;
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

// Create global app instance
window.MCQApp = MCQApp;