// Quiz Logic and Algorithms
class QuizLogic {
    constructor() {
        this.weights = {
            neverAsked: 100,
            neverCorrect: 90,
            lowAccuracy: 60,
            recentMistake: 15
        };
    }

    // Calculate priority score for question selection
    calculatePriority(question) {
        const timesAsked = question.timesAsked || 0;
        const timesCorrect = question.timesCorrect || 0;
        
        // Never asked - highest priority
        if (timesAsked === 0) {
            return this.weights.neverAsked;
        }
        
        // Asked once and wrong - high priority
        if (timesAsked === 1 && timesCorrect === 0) {
            return this.weights.neverCorrect;
        }
        
        // Calculate base score from accuracy
        const accuracy = timesAsked > 0 ? timesCorrect / timesAsked : 0.5;
        let score = (1 - accuracy) * this.weights.lowAccuracy;
        
        // Penalize frequently asked questions
        score -= Math.min(20, timesAsked * 2);
        
        // Ensure minimum score
        score = Math.max(10, score);
        
        // Boost for never getting it right
        if (timesAsked > 0 && timesCorrect === 0) {
            score += 20;
        }
        
        return score;
    }

    // Select questions using weighted random
    selectQuestions(questions, count = 25) {
        if (questions.length <= count) {
            return this.shuffle(questions);
        }
        
        // Calculate scores
        const questionsWithScores = questions.map(q => ({
            question: q,
            score: this.calculatePriority(q)
        }));
        
        // Sort by score (highest first)
        questionsWithScores.sort((a, b) => b.score - a.score);
        
        // Weighted random selection
        const selected = [];
        const totalScore = questionsWithScores.reduce((sum, q) => sum + q.score, 0);
        
        while (selected.length < count) {
            const random = Math.random() * totalScore;
            let cumulative = 0;
            
            for (const q of questionsWithScores) {
                cumulative += q.score;
                if (random <= cumulative && !selected.includes(q.question)) {
                    selected.push(q.question);
                    break;
                }
            }
            
            // Fallback: take highest priority questions
            if (selected.length < count) {
                const remaining = count - selected.length;
                const remainingQuestions = questionsWithScores
                    .filter(q => !selected.includes(q.question))
                    .slice(0, remaining)
                    .map(q => q.question);
                
                selected.push(...remainingQuestions);
            }
        }
        
        return this.shuffle(selected);
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Calculate difficulty level
    getDifficulty(questions) {
        if (questions.length === 0) return 'Medium';
        
        let totalAccuracy = 0;
        let count = 0;
        
        questions.forEach(q => {
            if (q.timesAsked > 0) {
                totalAccuracy += (q.timesCorrect / q.timesAsked) * 100;
                count++;
            }
        });
        
        if (count === 0) return 'Medium';
        
        const avgAccuracy = totalAccuracy / count;
        
        if (avgAccuracy >= 80) return 'Easy';
        if (avgAccuracy >= 50) return 'Medium';
        return 'Hard';
    }

    // Get performance insights
    getInsights(quizResults) {
        const insights = {
            weakAreas: [],
            strongPoints: [],
            suggestions: []
        };
        
        if (quizResults.length === 0) {
            insights.suggestions.push('Take your first quiz to get insights!');
            return insights;
        }
        
        // Calculate average score
        const avgScore = quizResults.reduce((sum, quiz) => sum + quiz.percentage, 0) / quizResults.length;
        
        if (avgScore >= 80) {
            insights.strongPoints.push('Excellent overall performance');
            insights.suggestions.push('Maintain consistency with regular practice');
        } else if (avgScore >= 60) {
            insights.strongPoints.push('Good progress');
            insights.suggestions.push('Focus on improving weak areas');
        } else {
            insights.weakAreas.push('Overall performance needs improvement');
            insights.suggestions.push('Review explanations and practice more');
        }
        
        // Check consistency
        const recentScores = quizResults.slice(0, 3).map(q => q.percentage);
        if (recentScores.length >= 2) {
            const variance = Math.max(...recentScores) - Math.min(...recentScores);
            if (variance > 30) {
                insights.weakAreas.push('Inconsistent performance');
                insights.suggestions.push('Practice regularly for consistent results');
            }
        }
        
        return insights;
    }

    // Predict next score
    predictScore(quizHistory) {
        if (quizHistory.length === 0) return 50;
        
        const recent = quizHistory.slice(0, 5);
        const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
        
        let predicted = 0;
        for (let i = 0; i < Math.min(recent.length, 5); i++) {
            predicted += recent[i].percentage * weights[i];
        }
        
        return Math.round(predicted);
    }

    // Generate study recommendations
    getRecommendations(stats) {
        const recs = [];
        
        if (stats.coverage < 50) {
            recs.push({
                priority: 'high',
                message: `Increase question bank coverage (currently ${stats.coverage}%)`,
                action: 'Take more quizzes to see all questions'
            });
        }
        
        if (stats.accuracy < 60) {
            recs.push({
                priority: 'high',
                message: `Improve accuracy (currently ${stats.accuracy}%)`,
                action: 'Review explanations for incorrect answers'
            });
        }
        
        if (stats.quizHistory.length < 5) {
            recs.push({
                priority: 'medium',
                message: 'Practice more regularly',
                action: 'Take at least one quiz daily'
            });
        }
        
        if (stats.coverage >= 80 && stats.accuracy >= 80) {
            recs.push({
                priority: 'low',
                message: 'Excellent progress!',
                action: 'Maintain with regular practice'
            });
        }
        
        // Sort by priority
        recs.sort((a, b) => {
            const priorityOrder = { high: 1, medium: 2, low: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
        
        return recs;
    }
}

// Create global instance
const quizLogic = new QuizLogic();