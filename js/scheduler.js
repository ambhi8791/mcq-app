// Quiz Scheduler for Hourly Tests
class QuizScheduler {
    constructor() {
        this.quizInterval = 60 * 60 * 1000; // 1 hour
        this.cooldown = 2 * 60 * 60 * 1000; // 2 hours
        this.timer = null;
        this.nextQuizTime = null;
    }

    start() {
        this.stop(); // Clear existing timer
        
        // Calculate next quiz time
        this.calculateNextQuizTime();
        
        // Start checking every minute
        this.timer = setInterval(() => {
            this.checkQuizTime();
        }, 60000); // Check every minute
        
        console.log('Scheduler started. Next quiz at:', new Date(this.nextQuizTime).toLocaleTimeString());
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    calculateNextQuizTime() {
        const lastQuizTime = localStorage.getItem('lastQuizTime');
        const now = Date.now();
        
        if (!lastQuizTime) {
            // First quiz - schedule for now + 1 hour
            this.nextQuizTime = now + this.quizInterval;
        } else {
            const timeSinceLastQuiz = now - parseInt(lastQuizTime);
            
            if (timeSinceLastQuiz >= this.cooldown) {
                // Ready for next quiz - schedule for now + 1 hour
                this.nextQuizTime = now + this.quizInterval;
            } else {
                // Still in cooldown - schedule for after cooldown
                const timeToCooldownEnd = this.cooldown - timeSinceLastQuiz;
                this.nextQuizTime = now + timeToCooldownEnd;
            }
        }
        
        localStorage.setItem('nextQuizTime', this.nextQuizTime);
    }

    checkQuizTime() {
        const now = Date.now();
        
        if (now >= this.nextQuizTime) {
            this.triggerQuiz();
            this.calculateNextQuizTime();
        }
    }

    triggerQuiz() {
        // Check if user can take quiz (not in cooldown)
        const lastQuizTime = localStorage.getItem('lastQuizTime');
        if (lastQuizTime) {
            const timeSinceLastQuiz = now - parseInt(lastQuizTime);
            if (timeSinceLastQuiz < this.cooldown) {
                // Still in cooldown, reschedule
                this.calculateNextQuizTime();
                return;
            }
        }
        
        // Show notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📚 Quiz Time!', {
                body: 'Time for your scheduled 25-question quiz!',
                icon: 'assets/icons/icon-192.png'
            });
        }
        
        // If app is on quiz page, show alert
        if (window.location.hash === '#quiz' || window.location.hash === '') {
            if (confirm('Time for your scheduled quiz! Start now?')) {
                if (window.app && typeof window.app.showView === 'function') {
                    window.app.showView('quiz');
                }
            }
        }
    }

    // Call this when user takes a quiz
    recordQuizTaken() {
        localStorage.setItem('lastQuizTime', Date.now());
        this.calculateNextQuizTime();
    }

    getTimeUntilNextQuiz() {
        const now = Date.now();
        const nextTime = parseInt(localStorage.getItem('nextQuizTime') || '0');
        
        if (!nextTime || nextTime <= now) {
            return 'Ready now!';
        }
        
        const timeLeft = nextTime - now;
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }
}

// Create global instance
const quizScheduler = new QuizScheduler();

// Start scheduler when page loads
document.addEventListener('DOMContentLoaded', () => {
    quizScheduler.start();
});