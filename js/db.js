// MCQ Database - IndexedDB Handler
class MCQDatabase {
    constructor() {
        this.dbName = 'MCQAppDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = (e) => {
                console.error('Database error:', e.target.error);
                reject(e.target.error);
            };
            
            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('Database opened');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                
                // Questions store
                if (!db.objectStoreNames.contains('questions')) {
                    const store = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('category', 'category', { unique: false });
                }
                
                // Quiz results store
                if (!db.objectStoreNames.contains('quizResults')) {
                    const store = db.createObjectStore('quizResults', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                }
                
                // Performance store
                if (!db.objectStoreNames.contains('performance')) {
                    const store = db.createObjectStore('performance', { keyPath: 'questionId' });
                    store.createIndex('timesAsked', 'timesAsked', { unique: false });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // Import CSV
    async importCSV(csvText, category = 'default') {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const questions = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = this.parseCSVLine(lines[i]);
            const question = {
                question: values[0] || '',
                optionA: values[1] || '',
                optionB: values[2] || '',
                optionC: values[3] || '',
                optionD: values[4] || '',
                correctAnswer: values[5] || 'A',
                explanation: values[6] || '',
                category: category,
                timesAsked: 0,
                timesCorrect: 0,
                lastAsked: null,
                addedDate: new Date().toISOString()
            };
            
            questions.push(question);
        }
        
        return await this.addQuestions(questions);
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim());
        return values;
    }

    async addQuestions(questions) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['questions'], 'readwrite');
            const store = transaction.objectStore('questions');
            
            let added = 0;
            let errors = 0;
            
            questions.forEach(question => {
                const request = store.add(question);
                
                request.onsuccess = () => added++;
                request.onerror = () => errors++;
            });
            
            transaction.oncomplete = () => resolve({ added, errors });
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getRandomQuestions(count = 25) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['questions', 'performance'], 'readonly');
            const questionStore = transaction.objectStore('questions');
            const performanceStore = transaction.objectStore('performance');
            
            const getAllRequest = questionStore.getAll();
            
            getAllRequest.onsuccess = async (e) => {
                let allQuestions = e.target.result;
                
                if (allQuestions.length === 0) {
                    resolve([]);
                    return;
                }
                
                // Get performance data
                const questionsWithPerf = await Promise.all(
                    allQuestions.map(async (q) => {
                        return new Promise((resolve) => {
                            const perfRequest = performanceStore.get(q.id);
                            perfRequest.onsuccess = (ev) => {
                                const perf = ev.target.result || { timesAsked: 0, timesCorrect: 0 };
                                resolve({
                                    ...q,
                                    timesAsked: perf.timesAsked,
                                    timesCorrect: perf.timesCorrect
                                });
                            };
                        });
                    })
                );
                
                // Apply weighted selection
                const selected = this.weightedRandomSelection(questionsWithPerf, count);
                resolve(selected);
            };
            
            getAllRequest.onerror = (e) => reject(e.target.error);
        });
    }

    weightedRandomSelection(questions, count) {
        if (questions.length <= count) {
            return this.shuffleArray(questions);
        }
        
        const now = Date.now();
        const questionsWithScores = questions.map(q => {
            let score = 0;
            
            if (q.timesAsked === 0) {
                score = 100;
            } else {
                const accuracy = q.timesAsked > 0 ? q.timesCorrect / q.timesAsked : 0.5;
                score = (1 - accuracy) * 60;
                
                // Boost for never correct
                if (q.timesAsked > 0 && q.timesCorrect === 0) {
                    score += 20;
                }
                
                // Penalize frequently asked
                score -= Math.min(20, q.timesAsked * 2);
                score = Math.max(10, score);
            }
            
            return { question: q, score };
        });
        
        // Sort by score
        questionsWithScores.sort((a, b) => b.score - a.score);
        
        // Select top questions
        const selected = questionsWithScores
            .slice(0, count)
            .map(q => q.question);
        
        return this.shuffleArray(selected);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async updateQuestionPerformance(questionId, wasCorrect) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['performance', 'questions'], 'readwrite');
            const perfStore = transaction.objectStore('performance');
            const questionStore = transaction.objectStore('questions');
            
            // Update performance
            perfStore.get(questionId).onsuccess = (e) => {
                let perf = e.target.result || { questionId, timesAsked: 0, timesCorrect: 0 };
                perf.timesAsked++;
                if (wasCorrect) perf.timesCorrect++;
                perf.lastAttempt = new Date().toISOString();
                
                perfStore.put(perf);
                
                // Update question lastAsked
                questionStore.get(questionId).onsuccess = (ev) => {
                    const question = ev.target.result;
                    if (question) {
                        question.lastAsked = new Date().toISOString();
                        questionStore.put(question);
                    }
                };
                
                resolve(perf);
            };
            
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    async saveQuizResult(result) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['quizResults'], 'readwrite');
            const store = transaction.objectStore('quizResults');
            
            const quizData = {
                date: new Date().toISOString(),
                score: result.score,
                total: result.total,
                percentage: result.percentage,
                duration: result.duration,
                category: result.category || 'general'
            };
            
            const request = store.add(quizData);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getProgressStats() {
        return new Promise(async (resolve, reject) => {
            try {
                const [totalQuestions, quizResults, performanceData] = await Promise.all([
                    this.getTotalQuestions(),
                    this.getQuizResults(),
                    this.getPerformanceSummary()
                ]);
                
                const stats = {
                    totalQuestions,
                    totalAsked: performanceData.totalAsked,
                    totalCorrect: performanceData.totalCorrect,
                    coverage: performanceData.coverage,
                    accuracy: performanceData.accuracy,
                    quizHistory: quizResults
                };
                
                resolve(stats);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getTotalQuestions() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['questions'], 'readonly');
            const store = transaction.objectStore('questions');
            const countRequest = store.count();
            
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = () => reject(countRequest.error);
        });
    }

    async getQuizResults(limit = 20) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['quizResults'], 'readonly');
            const store = transaction.objectStore('quizResults');
            const index = store.index('date');
            
            const request = index.openCursor(null, 'prev');
            const results = [];
            
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getPerformanceSummary() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['performance'], 'readonly');
            const store = transaction.objectStore('performance');
            const request = store.getAll();
            
            request.onsuccess = async (e) => {
                const allPerf = e.target.result;
                
                const summary = allPerf.reduce((acc, perf) => {
                    acc.totalAsked += perf.timesAsked;
                    acc.totalCorrect += perf.timesCorrect;
                    return acc;
                }, { totalAsked: 0, totalCorrect: 0 });
                
                // Get total questions for coverage
                const totalQuestions = await this.getTotalQuestions();
                
                summary.coverage = totalQuestions > 0 ? 
                    Math.min(100, Math.round((summary.totalAsked / totalQuestions) * 100)) : 0;
                summary.accuracy = summary.totalAsked > 0 ? 
                    Math.round((summary.totalCorrect / summary.totalAsked) * 100) : 0;
                
                resolve(summary);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getQuestion(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['questions'], 'readonly');
            const store = transaction.objectStore('questions');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateQuestionExplanation(questionId, explanation) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['questions'], 'readwrite');
            const store = transaction.objectStore('questions');
            
            const request = store.get(questionId);
            request.onsuccess = (e) => {
                const question = e.target.result;
                if (question) {
                    question.explanation = explanation;
                    store.put(question);
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clearDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// Create global instance
const mcqDB = new MCQDatabase();