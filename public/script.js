document.addEventListener('DOMContentLoaded', () => {
    // State
    let rules = null;
    let currentQuestions = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let isAnswering = false;
    let currentDifficulty = null; // Add difficulty tracking
    let optionKeys = []; // NFC/Keyboard answer options

    // DOM Elements
    const startScreen = document.getElementById('start-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const resultScreen = document.getElementById('result-screen');
    const howToPlayScreen = document.getElementById('how-to-play-screen');

    const kantanBtn = document.getElementById('btn-kantan');
    const muriBtn = document.getElementById('btn-muri');
    const howtoBtn = document.getElementById('btn-howto');
    const backToTitleBtn = document.getElementById('btn-back-to-title');
    const nextBtn = document.getElementById('next-btn');
    const restartBtn = document.getElementById('restart-btn');

    const trashName = document.getElementById('trash-name');
    const trashDetail = document.getElementById('trash-detail');
    const currentQuestionNum = document.getElementById('current-question-num');
    const totalQuestionsNum = document.getElementById('total-questions-num');
    const scoreDisplay = document.getElementById('score-display');

    const feedbackOverlay = document.getElementById('feedback-overlay');
    const feedbackIcon = document.getElementById('feedback-icon');
    const feedbackTitle = document.getElementById('feedback-title');
    const feedbackText = document.getElementById('feedback-text');

    const finalScoreText = document.getElementById('final-score-text');
    const finalTimeText = document.getElementById('final-time-text');
    const finalRankText = document.getElementById('final-rank-text');
    const backToHomeBtn = document.getElementById('btn-back-to-home');

    const interruptBtn = document.getElementById('btn-interrupt-img');
    const interruptDialog = document.getElementById('interrupt-dialog');
    const interruptYesBtn = document.getElementById('btn-interrupt-yes');
    const interruptNoBtn = document.getElementById('btn-interrupt-no');

    const effectsContainer = document.querySelector('.effects-container');
    const charactersContainer = document.querySelector('.characters-container');
    const judgmentMark = document.getElementById('judgment-mark');
    const explanationBox = document.getElementById('explanation-box');
    const smallJudgmentMark = document.getElementById('small-judgment-mark');

    // Sound Effects
    const correctSound = new Audio('./sounds/Quiz-Ding_Dong05-1(Fast-Short).mp3');
    const incorrectSound = new Audio('./sounds/Quiz-Buzzer05-1(Mid).mp3');

    // BGM Audio Objects
    const bgmHome = new Audio('./sounds/home.mp3');
    const bgmPlay = new Audio('./sounds/play.mp3');
    const bgmResult = new Audio('./sounds/result.mp3');
    
    // Set all BGMs to loop
    bgmHome.loop = true;
    bgmPlay.loop = true;
    bgmResult.loop = true;
    
    // BGM Control Function
    function switchBGM(targetBgm) {
        // Stop all BGMs
        bgmHome.pause();
        bgmPlay.pause();
        bgmResult.pause();
        bgmHome.currentTime = 0;
        bgmPlay.currentTime = 0;
        bgmResult.currentTime = 0;
        
        // Play target BGM
        if (targetBgm) {
            targetBgm.currentTime = 0;
            targetBgm.play().catch(err => {
                console.log('BGM playback failed (might be blocked by browser autoplay policy):', err);
            });
        }
    }
    
    // Autoplay Policy Response: Initialize BGM on first user interaction
    let bgmInitialized = false;
    document.body.addEventListener('click', () => {
        if (!bgmInitialized) {
            bgmInitialized = true;
            // Start home BGM if on start screen
            if (startScreen.classList.contains('active-screen')) {
                switchBGM(bgmHome);
            }
        }
    }, { once: true });

    // Timer
    let timerInterval = null;
    let startTime = null;
    let totalTime = 0;
    const timerDisplay = document.getElementById('timer-display');
    let isTransitioning = false; // Flag to prevent rapid NFC scanning during transitions
    
    // Screen switching function using class-based approach
    function activateScreen(screenId) {
        // Remove .active-screen from all screens
        [startScreen, quizScreen, resultScreen, howToPlayScreen].forEach(s => {
            s.classList.remove('active-screen');
        });
        
        // Add .active-screen to target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active-screen');
            console.log(`Activated screen: ${screenId}`);
        } else {
            console.error(`Screen not found: ${screenId}`);
        }
    }
    
    // Initialize - set start screen as active
    startScreen.classList.add('active-screen');
    
    init();

    function init() {
        // Event listeners for buttons - Title buttons
        if (kantanBtn) kantanBtn.addEventListener('click', () => {
            console.log('Kantan button clicked');
            loadRulesAndStart('easy');
        });
        if (muriBtn) muriBtn.addEventListener('click', () => {
            console.log('Muri button clicked');
            loadRulesAndStart('normal');
        });
        if (howtoBtn) howtoBtn.addEventListener('click', () => {
            console.log('Howto button clicked');
            activateScreen('how-to-play-screen');
        });
        
        // Back to Title button from How-to-Play screen
        if (backToTitleBtn) {
            backToTitleBtn.addEventListener('click', () => {
                console.log('Back to title button clicked');
                switchBGM(bgmHome);
                activateScreen('start-screen');
            });
        }
        
        if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
        
        // Back to Home button on result screen
        if (backToHomeBtn) {
            backToHomeBtn.addEventListener('click', () => {
                console.log('Back to home button clicked');
                switchBGM(bgmHome);
                activateScreen('start-screen');
            });
        }
        
        if (interruptBtn) interruptBtn.addEventListener('click', showInterruptDialog);
        if (interruptYesBtn) interruptYesBtn.addEventListener('click', interruptQuiz);
        if (interruptNoBtn) interruptNoBtn.addEventListener('click', hideInterruptDialog);

        // Keyboard input for NFC/Direct input (1, 2, 3, 4 keys)
        document.addEventListener('keydown', (event) => {
            // Only accept numeric input during quiz screen and when answering
            if (!quizScreen.classList.contains('active') || !isAnswering) {
                return;
            }
            
            const keyNum = parseInt(event.key);
            if (keyNum >= 1 && keyNum <= 4 && keyNum <= optionKeys.length) {
                const selectedKey = optionKeys[keyNum - 1];
                handleAnswer(selectedKey);
            }
        });

        // Connect to WebSocket server for NFC interactions
        connectWebSocket();
    }

    async function loadRulesAndStart(difficulty) {
        try {
            currentDifficulty = difficulty; // Save current difficulty
            const response = await fetch(`./rules/${difficulty}.json`);
            rules = await response.json();
            console.log('Rules loaded:', rules);

            // Update title based on city
            //document.querySelector('.subtitle').textContent = `${rules.municipality}編`;

            // Switch to play BGM
            switchBGM(bgmPlay);
            
            startQuiz();
        } catch (error) {
            console.error('Failed to load rules:', error);
            alert('ルールデータの読み込みに失敗しました。');
        }
    }

    // WebSocket Connection
    function connectWebSocket() {
        console.log('Attempting to connect to WebSocket...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            console.log('WebSocket raw message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket parsed data:', data);

                const explanationBox = document.getElementById('explanation-red-box');
                const isExplanationVisible = explanationBox && !explanationBox.classList.contains('hidden');

                if (data.type === 'answer' && data.category) {
                    console.log(`Processing answer: ${data.category}, isAnswering: ${isAnswering}, isExplanationVisible: ${isExplanationVisible}`);
                    
                    if (isTransitioning) {
                        console.log('NFC tag detected during transition, ignoring');
                        return;
                    }

                    if (isExplanationVisible) {
                        // If explanation is visible, any NFC tag (like "〇" or "×") advances to next question
                        if (data.category === '次の問題へ') {
                            console.log('NFC tag detected during explanation, moving to next question');
                            handleNextQuestion();
                        }
                    } else {
                        // Normal quiz answering
                        handleAnswer(data.category);
                    }
                }
            } catch (e) {
                console.error('Error processing WebSocket message:', e);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected. Retrying in 3 seconds...');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            ws.close();
        };
    }

    function startQuiz() {
        score = 0;
        currentQuestionIndex = 0;
        totalTime = 0; // Reset total time
        // Shuffle and pick 5 questions
        currentQuestions = shuffleArray([...rules]).slice(0, 5);

        updateScoreDisplay();
        activateScreen('quiz-screen');
        loadQuestion();
    }

    function loadQuestion() {
        feedbackOverlay.classList.add('hidden'); // Ensure feedback is hidden
        effectsContainer.classList.add('hidden'); // Hide effects container
        document.getElementById('explanation-red-box').classList.add('hidden'); // Hide explanation box
        document.getElementById('explanation-red-box').classList.add('fade-out'); // Ensure fade-out is applied
        
        // Reset blue box to center (remove moved-up animation)
        document.getElementById('question-box').classList.remove('moved-up');
        
        // Show score display for new question
        document.getElementById('score-display').style.display = 'block';
        
        // Reset small judgment mark
        smallJudgmentMark.classList.add('hidden'); // Hide small mark
        smallJudgmentMark.textContent = ''; // Clear text
        smallJudgmentMark.classList.remove('mark-maru', 'mark-batsu'); // Remove mark classes
        
        // Reset fade-out classes for characters and timer
        charactersContainer.classList.remove('fade-out'); // Show characters for new question
        document.getElementById('timer-display').classList.remove('fade-out'); // Show timer
        judgmentMark.classList.remove('fade-out'); // Reset judgment mark
        
        isAnswering = false;

        // Stop previous timer if running
        if (timerInterval) {
            clearInterval(timerInterval);
        }

        // Start timer for this question
        startTime = Date.now();
        // Immediately display initial timer value before first setInterval tick
        timerDisplay.textContent = 'じかん: 0';
        timerInterval = setInterval(() => {
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000); // Convert to seconds
            timerDisplay.textContent = 'じかん: ' + elapsedTime;
        }, 1000); // Update every 1000ms (1 second)

        console.log('Loading question, input disabled');

        // Prevent accidental double-clicks or ghost clicks during transition
        setTimeout(() => {
            isAnswering = true;
            console.log('Input enabled');
        }, 500);
        const item = currentQuestions[currentQuestionIndex];

        // Update UI
        trashName.textContent = item.title;
        trashDetail.textContent = item.question;
        currentQuestionNum.textContent = currentQuestionIndex + 1;
        totalQuestionsNum.textContent = currentQuestions.length;

        // Generate answer options (for keyboard/NFC input) - for now use simple key-based approach
        optionKeys = ['a', 'b', 'c', 'd'];
        
        console.log('Current question:', item.title, 'Answer:', item.answer);
    }

    function handleAnswer(selectedKey) {
        if (!isAnswering) {
            console.log('Answered too early, ignoring');
            return;
        }
        isAnswering = false;

        // Stop timer and calculate time for this question
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        const questionTime = (Date.now() - startTime) / 1000; // Convert to seconds
        totalTime += questionTime;

        const currentItem = currentQuestions[currentQuestionIndex];
        
        // Determine if the answer is correct by comparing method
        // If selectedKey is an NFC category name (not a keyboard key), do direct string comparison
        // Otherwise, use keyboard input logic (comparing with optionKeys[0])
        let isCorrect = false;
        
        // Check if selectedKey is a keyboard input (a, b, c, d) or an NFC category name
        if (selectedKey === 'a' || selectedKey === 'b' || selectedKey === 'c' || selectedKey === 'd') {
            // Keyboard input mode: compare with optionKeys[0]
            isCorrect = selectedKey === optionKeys[0];
            console.log('Keyboard input detected. isCorrect:', isCorrect);
        } else {
            // NFC category name mode: direct string comparison with currentItem.answer
            isCorrect = selectedKey === currentItem.answer;
            console.log('NFC category detected. Comparing:', selectedKey, 'with answer:', currentItem.answer, 'isCorrect:', isCorrect);
        }

        // Show judgement mark
        if (isCorrect) {
            score++;
            updateScoreDisplay();
            judgmentMark.innerHTML = '<div class="mark-correct"></div>';
            // Play correct sound
            correctSound.currentTime = 0;
            correctSound.play();
        } else {
            judgmentMark.innerHTML = '<div class="mark-incorrect">✕</div>';
            // Play incorrect sound
            incorrectSound.currentTime = 0;
            incorrectSound.play();
        }
        effectsContainer.classList.remove('hidden');

        // STEP 2 (約1000ミリ秒後): キャラクター、タイマーに .fade-out を付与（おわるボタンは表示維持）
        setTimeout(() => {
            charactersContainer.classList.add('fade-out');
            document.getElementById('timer-display').classList.add('fade-out');
            
            // STEP 3 (約1500ミリ秒後): 赤い解説ブロックと小さな判定マークを表示
            setTimeout(() => {
                const categoryName_label = isCorrect ? currentItem.answer : '不正解';
                const explanationContent = `
                    正解は「<strong>${currentItem.answer}</strong>」です。<br><br>
                    ${currentItem.explanation}<br><br>
                `;
                document.getElementById('explanation-text').innerHTML = explanationContent;
                
                // Slide blue box up and display red explanation box
                document.getElementById('question-box').classList.add('moved-up');
                document.getElementById('explanation-red-box').classList.remove('hidden');
                document.getElementById('explanation-red-box').classList.remove('fade-out');
                
                // Hide score display during explanation
                document.getElementById('score-display').style.display = 'none';
                
                // Display small judgment mark on bottom left (using text instead of image)
                if (isCorrect) {
                    smallJudgmentMark.textContent = '〇';
                    smallJudgmentMark.classList.remove('mark-batsu');
                    smallJudgmentMark.classList.add('mark-maru');
                } else {
                    smallJudgmentMark.textContent = '×';
                    smallJudgmentMark.classList.remove('mark-maru');
                    smallJudgmentMark.classList.add('mark-batsu');
                }
                smallJudgmentMark.classList.remove('hidden');
                
                // STEP 4 (約2000ミリ秒後): 〇×マークを消す
                setTimeout(() => {
                    judgmentMark.classList.add('fade-out');
                }, 500);
            }, 500);
        }, 1000);
    }

    function showFeedback(isCorrect, item) {
        effectsContainer.classList.add('hidden'); // Hide effects
        charactersContainer.classList.add('hidden'); // Hide characters when showing feedback
        document.querySelector('.layer-front-ui').classList.add('hidden'); // Hide timer and button
        feedbackOverlay.classList.remove('hidden');

        if (isCorrect) {
            feedbackIcon.textContent = '⭕';
            feedbackTitle.textContent = '正解！';
            feedbackTitle.className = 'correct';
        } else {
            feedbackIcon.textContent = '❌';
            feedbackTitle.textContent = '残念...';
            feedbackTitle.className = 'incorrect';
        }

        const categoryName_label = item.answer;
        
        // Display brief message in feedback overlay
        feedbackText.innerHTML = `
            正解は「<strong>${categoryName_label}</strong>」です。<br><br>
            ${item.explanation}<br><br>
        `;
    }

    function nextQuestion() {
        feedbackOverlay.classList.add('hidden');
        currentQuestionIndex++;

        if (currentQuestionIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            showResult();
        }
    }
    
    function handleNextQuestion() {
        if (isTransitioning) return;
        isTransitioning = true;
        
        // Hide red explanation box with fade-out
        document.getElementById('explanation-red-box').classList.add('fade-out');
        
        // Hide small judgment mark
        smallJudgmentMark.classList.add('hidden');
        
        // Show characters, timer by removing fade-out class
        charactersContainer.classList.remove('fade-out');
        document.getElementById('timer-display').classList.remove('fade-out');
        
        // Move to next question
        currentQuestionIndex++;
        
        if (currentQuestionIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            showResult();
        }

        // Reset transitioning flag after 1.5 seconds to prevent rapid scanning
        setTimeout(() => {
            isTransitioning = false;
            console.log('NFC scanning re-enabled');
        }, 2000);
    }

    function showResult() {
        activateScreen('result-screen');
        switchBGM(bgmResult);
        
        // Calculate score (10 points per correct answer)
        const totalScore = score * 10;
        const maxScore = currentQuestions.length * 10;
        
        // Display score
        document.getElementById('final-score-value').textContent = totalScore;
        
        // Display time in "ふん" and "びょう" format (divide totalTime into minutes and seconds)
        const totalSeconds = Math.round(totalTime);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeText = minutes > 0 ? minutes + 'ふん' + seconds + 'びょう' : seconds + 'びょう';
        document.getElementById('final-time-value').textContent = timeText;
        
        // Calculate rank based on percentage
        const percentage = (score / currentQuestions.length) * 100;
        let rank = '';
        if (percentage === 100) {
            rank = 'Sランク 🏆';
        } else if (percentage >= 70) {
            rank = 'Aランク 🌟';
        } else if (percentage >= 40) {
            rank = 'Bランク 👍';
        } else {
            rank = 'Cランク 🔰';
        }
        finalRankText.textContent = rank;
    }

    function resetQuiz() {
        // Reset quiz state
        score = 0;
        currentQuestionIndex = 0;
        totalTime = 0;
        isAnswering = false;
        currentDifficulty = null;
        
        // Stop timer
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        // Clear question data
        currentQuestions = [];
        optionKeys = [];
        
        // Go to title screen
        switchBGM(bgmHome);
        activateScreen('start-screen');
    }

    function playAgain() {
        // Reset score and timer
        score = 0;
        totalTime = 0;
        currentQuestionIndex = 0;
        
        // Clear timer if running
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        // Restart with the same difficulty
        if (currentDifficulty) {
            loadRulesAndStart(currentDifficulty);
        } else {
            // Fallback to title screen if no difficulty was saved
            activateScreen('start-screen');
        }
    }

    function showHowToPlay() {
        activateScreen('how-to-play-screen');
    }

    function backToTitle() {
        timerInterval && clearInterval(timerInterval);
        switchBGM(bgmHome);
        activateScreen('start-screen');
    }

    function showInterruptDialog() {
        interruptDialog.style.display = 'flex';
    }

    function hideInterruptDialog() {
        interruptDialog.style.display = 'none';
    }

    function interruptQuiz() {
        // Hide dialog first
        hideInterruptDialog();
        
        // Reset all quiz state
        score = 0;
        currentQuestionIndex = 0;
        totalTime = 0;
        isAnswering = false;
        currentDifficulty = null;
        
        // Stop timer
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        // Clear question data
        currentQuestions = [];
        optionKeys = [];
        
        // Switch to home BGM
        switchBGM(bgmHome);
        
        // Go to title screen
        activateScreen('start-screen');
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = `スコア: ${score}`;
    }

    // Utility: Fisher-Yates Shuffle
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});
