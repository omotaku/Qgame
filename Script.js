// ===== ★重要★ Firebaseの準備でコピーした`firebaseConfig`をここに貼り付け =====
  const firebaseConfig = {
    apiKey: "AIzaSyCXAPVZZqDDZsmrRCsAoRPkax6j3_iMlZg",
    authDomain: "qgame-57753.firebaseapp.com",
    projectId: "qgame-57753",
    storageBucket: "qgame-57753.firebasestorage.app",
    messagingSenderId: "414616796879",
    appId: "1:414616796879:web:639eef8b493d5cce5901ba",
    measurementId: "G-3VLJRH61N9"
  };
// =======================================================================


// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const quizzesCollection = db.collection('quizzes');
const usersCollection = db.collection('users'); // ユーザーデータ用コレクション


// ===== ゲーム内設定 =====
const TITLES = {
    1: "駆け出し", 5: "クイズ初心者", 10: "クイズ愛好家", 20: "クイズの探求者",
    30: "クイズマスター", 50: "歩くデータベース", 75: "クイズの賢者", 100: "クイズ神"
};

const EXP_TABLE = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250]; // Lv1～10まで


// HTML要素を取得
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const quizPage = document.getElementById('quiz-page');
const resultPage = document.getElementById('result-page');
const createPage = document.getElementById('create-page');

// イベントリスナー
document.getElementById('login-button').addEventListener('click', signInWithGoogle);
document.getElementById('logout-button').addEventListener('click', signOut);
document.getElementById('save-quiz-button').addEventListener('click', saveQuiz);
document.getElementById('show-create-page-button').addEventListener('click', showCreatePage);
document.getElementById('back-to-main-from-create-button').addEventListener('click', showMainPage);
document.getElementById('back-to-main-button').addEventListener('click', showMainPage);
document.getElementById('back-to-main-from-result-button').addEventListener('click', showMainPage);
document.getElementById('play-again-button').addEventListener('click', () => startGame(currentQuizzesData));
document.getElementById('add-question-button').addEventListener('click', addQuestionToList);
document.getElementById('add-choice-button').addEventListener('click', () => addChoiceInput());
document.querySelectorAll('input[name="question-type"]').forEach(radio => {
    radio.addEventListener('change', toggleQuestionTypeForm);
});
document.getElementById('submit-answer-button').addEventListener('click', submitAndCheckAnswer);
document.querySelectorAll('input[name="check-type"]').forEach(radio => {
    radio.addEventListener('change', toggleChoiceInputType);
});
document.getElementById('anonymous-login-button').addEventListener('click', signInAnonymously);


// ゲーム状態を管理する変数
let currentUser = null;
let currentUserData = {};
let currentQuizzesData = null;
let currentQuizIndex = 0;
let score = 0;
let newQuizQuestions = [];


// ===== 認証処理 =====
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error(error));
}
// (signInWithGoogle と signOut の間にでも追加してください)

// ★★★ この関数を新しく追加 ★★★
function signInAnonymously() {
    auth.signInAnonymously().catch(error => {
        console.error("Anonymous sign-in failed:", error);
        alert("ゲストとしてのログインに失敗しました。時間をおいて再度お試しください。");
    });
}
function signOut() {
    auth.signOut();
}

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;

        // ★★★ ここから変更 ★★★
        if (user.isAnonymous) {
            // 匿名ユーザーの場合
            currentUserData = {
                displayName: "ゲスト",
                level: 1,
                exp: 0
            };
            updatePlayerUI(); // ゲスト用のUIを表示
            showMainPage();
        } else {
            // Googleログインユーザーの場合
            await loadOrCreateUserData(user); // 従来通りデータを読み込む
            updatePlayerUI();
            showMainPage();
        }
        // ★★★ ここまで変更 ★★★

    } else {
        currentUser = null;
        currentUserData = {};
        loginPage.classList.remove('hidden');
        mainPage.classList.add('hidden');
        quizPage.classList.add('hidden');
        resultPage.classList.add('hidden');
        createPage.classList.add('hidden');
    }
});

async function loadOrCreateUserData(user) {
    const userRef = usersCollection.doc(user.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
        const initialUserData = {
            displayName: user.displayName, email: user.email,
            level: 1, exp: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(initialUserData);
        currentUserData = initialUserData;
    } else {
        currentUserData = doc.data();
    }
}


// ===== Firestore (データベース) 処理 =====
async function saveQuiz() {
    const title = document.getElementById('quiz-title').value;
    if (!title.trim()) { alert('クイズ全体のタイトルを入力してください。'); return; }
    if (newQuizQuestions.length === 0) { alert('問題が1つもありません。最低1問は追加してください。'); return; }

    try {
        await quizzesCollection.add({
            title: title, quizzes: newQuizQuestions,
            authorName: currentUser.displayName, authorId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('クイズを投稿しました！');
        showMainPage();
    } catch (error) {
        alert('クイズの投稿に失敗しました。');
        console.error(error);
    }
}

async function loadQuizzes() {
    const quizListDiv = document.getElementById('quiz-list');
    quizListDiv.innerHTML = '<p>クイズを読み込んでいます...</p>';
    const snapshot = await quizzesCollection.orderBy('createdAt', 'desc').get();
    quizListDiv.innerHTML = '';
    if (snapshot.empty) { quizListDiv.innerHTML = '<p>まだクイズが投稿されていません。</p>'; return; }

    snapshot.forEach(doc => {
        const quiz = doc.data();
        quiz.id = doc.id;
        const item = document.createElement('div');
        item.className = 'quiz-list-item';

        let buttonsHTML = `<button class="play-button">このクイズで遊ぶ</button>`;
        if (currentUser && currentUser.uid === quiz.authorId) {
            buttonsHTML += `<button class="delete-button" data-id="${doc.id}">削除</button>`;
        }
        item.innerHTML = `
            <div><strong>${quiz.title}</strong><small> (作成者: ${quiz.authorName})</small></div>
            <div class="quiz-list-item-buttons">${buttonsHTML}</div>`;

        item.querySelector('.play-button').addEventListener('click', () => startGame(quiz));
        const deleteBtn = item.querySelector('.delete-button');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteQuiz(doc.id, quiz.title));
        }
        quizListDiv.appendChild(item);
    });
}

async function deleteQuiz(docId, quizTitle) {
    if (!confirm(`「${quizTitle}」を本当に削除しますか？この操作は元に戻せません。`)) { return; }
    try {
        await db.collection('quizzes').doc(docId).delete();
        alert('クイズを削除しました。');
        loadQuizzes();
    } catch (error) {
        alert('クイズの削除に失敗しました。');
        console.error("Error removing document: ", error);
    }
}


// ===== ゲームロジック =====
function startGame(data) {
    currentQuizzesData = data;
    currentQuizIndex = 0;
    score = 0;
    mainPage.classList.add('hidden');
    resultPage.classList.add('hidden');
    createPage.classList.add('hidden');
    quizPage.classList.remove('hidden');
    document.getElementById('quiz-play-title').textContent = currentQuizzesData.title;
    showQuiz();
}

function showQuiz() {
    const quiz = currentQuizzesData.quizzes[currentQuizIndex];
    document.getElementById('question').textContent = quiz.question;

    const choicesArea = document.getElementById('choices-display-area');
    const textInputArea = document.getElementById('text-input-quiz-area');
    const submitBtn = document.getElementById('submit-answer-button');
    choicesArea.innerHTML = '';

    choicesArea.classList.add('hidden');
    textInputArea.classList.add('hidden');
    submitBtn.classList.add('hidden');

    if (quiz.type === 'text-input') {
        textInputArea.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        document.getElementById('user-answer-text').value = '';
        document.getElementById('user-answer-text').disabled = false;
        document.getElementById('user-answer-text').focus();
    } else if (quiz.type === 'multiple-choice') {
        choicesArea.classList.remove('hidden');
        const checkType = quiz.checkType || 'single';

        if (checkType === 'single') {
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'choice-button-group';
            quiz.choices.forEach(choice => {
                const button = document.createElement('button');
                button.textContent = choice;
                button.className = 'choice-button';
                button.addEventListener('click', checkAnswer);
                buttonGroup.appendChild(button);
            });
            choicesArea.appendChild(buttonGroup);
        } else {
            submitBtn.classList.remove('hidden');
            const checkboxGroup = document.createElement('div');
            checkboxGroup.className = 'choice-checkbox-group';
            quiz.choices.forEach(choice => {
                const item = document.createElement('label');
                item.className = 'choice-checkbox-item';
                item.innerHTML = `<input type="checkbox" name="user-answer-checkbox" value="${choice}"> ${choice}`;
                checkboxGroup.appendChild(item);
            });
            choicesArea.appendChild(checkboxGroup);
        }
    }
    submitBtn.disabled = false;
}

function checkAnswer(event) {
    const selectedButton = event.target;
    const selectedAnswer = selectedButton.textContent;
    const correctAnswers = Array.isArray(currentQuizzesData.quizzes[currentQuizIndex].answer) 
        ? currentQuizzesData.quizzes[currentQuizIndex].answer 
        : [currentQuizzesData.quizzes[currentQuizIndex].answer];
    const choiceButtons = document.querySelectorAll('.choice-button');
    choiceButtons.forEach(b => b.disabled = true);

    if (correctAnswers.includes(selectedAnswer)) {
        score++;
        selectedButton.classList.add('correct-answer');
    } else {
        selectedButton.classList.add('incorrect-answer');
        // ★変更点：正解をハイライトする処理を削除
    }
    goToNextQuestion();
}

function submitAndCheckAnswer() {
    const quiz = currentQuizzesData.quizzes[currentQuizIndex];
    const correctAnswers = quiz.answer;
    let isCorrect = false;
    const submitBtn = document.getElementById('submit-answer-button');
    submitBtn.disabled = true;
    
    if (quiz.type === 'text-input') {
        const userAnswer = document.getElementById('user-answer-text').value.trim().toLowerCase();
        document.getElementById('user-answer-text').disabled = true;
        isCorrect = correctAnswers.some(ans => ans.trim().toLowerCase() === userAnswer);
    } else {
        const userCheckboxes = document.querySelectorAll('input[name="user-answer-checkbox"]:checked');
        const userAnswers = Array.from(userCheckboxes).map(cb => cb.value);
        if (quiz.checkType === 'all') {
            isCorrect = userAnswers.length === correctAnswers.length && userAnswers.every(ans => correctAnswers.includes(ans));
        } else {
            isCorrect = userAnswers.some(ans => correctAnswers.includes(ans));
        }
    }
    
    if(isCorrect) {
        submitBtn.classList.add('correct-answer');
    } else {
        submitBtn.classList.add('incorrect-answer');
    }
    showAnswerFeedback(isCorrect);
    goToNextQuestion();
}

function showAnswerFeedback(isCorrect) {
    const quiz = currentQuizzesData.quizzes[currentQuizIndex];
    if (isCorrect) {
        score++;
    } else {
        // ★変更点：答えを表示するアラートを削除
        // ここで「不正解！」というシンプルなフィードバックを出すことも可能
    }

    if(quiz.type === 'multiple-choice' && quiz.checkType !== 'single') {
        document.querySelectorAll('.choice-checkbox-item').forEach(item => {
            const checkbox = item.querySelector('input');
            // ★変更点：正解をハイライトする処理を削除
            if (checkbox.checked && !isCorrect) { // 自分がチェックしたものが不正解だった場合のみ
                item.classList.add('incorrect-answer');
            }
            checkbox.disabled = true;
        });
    } else if (quiz.type === 'text-input') {
        const inputField = document.getElementById('user-answer-text');
        if (isCorrect) {
            inputField.classList.add('correct-answer');
        } else {
            inputField.classList.add('incorrect-answer');
        }
    }
}

function showResult() {
    quizPage.classList.add('hidden');
    resultPage.classList.remove('hidden');
    document.getElementById('score-text').textContent = `あなたは ${currentQuizzesData.quizzes.length}問中 ${score}問 正解しました！`;
    calculateAndUpdateExp();
}


// ===== UIヘルパー関数 =====
function showMainPage() {
    mainPage.classList.remove('hidden');
    loginPage.classList.add('hidden'); createPage.classList.add('hidden');
    quizPage.classList.add('hidden'); resultPage.classList.add('hidden');
    updatePlayerUI();
    loadQuizzes();
}

function showCreatePage() {
    mainPage.classList.add('hidden');
    createPage.classList.remove('hidden');
    document.getElementById('quiz-title').value = '';
    newQuizQuestions = [];
    document.querySelector('input[name="question-type"][value="multiple-choice"]').checked = true;
    document.querySelector('input[name="check-type"][value="single"]').checked = true;
    toggleQuestionTypeForm();
    toggleChoiceInputType();
    renderPreviewList();
}

function clearQuestionForm() {
    document.getElementById('new-question-text').value = '';
    document.getElementById('text-answer-input').value = '';
    const choicesEditor = document.getElementById('choices-editor-area');
    choicesEditor.innerHTML = '';
    addChoiceInput(); addChoiceInput();
}

function renderPreviewList() {
    const previewListDiv = document.getElementById('quiz-preview-list');
    previewListDiv.innerHTML = newQuizQuestions.length === 0 ? '<p>まだ問題がありません。</p>' : '';
    newQuizQuestions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        let answerPreview = '';
        if (q.type === 'text-input') {
            answerPreview = `<small>(入力: ${q.answer.join(', ')})</small>`;
        } else {
            let typeStr = {'single': '単一正解', 'all': '完全正解', 'any': '部分正解'}[q.checkType];
            answerPreview = `<small>(${typeStr}: ${q.answer.join(', ')})</small>`;
        }
        item.innerHTML = `<p><strong>Q${index + 1}:</strong> ${q.question} ${answerPreview}</p><button data-index="${index}">削除</button>`;
        item.querySelector('button').addEventListener('click', (e) => {
            newQuizQuestions.splice(parseInt(e.target.dataset.index, 10), 1);
            renderPreviewList();
        });
        previewListDiv.appendChild(item);
    });
}

function addQuestionToList() {
    const questionText = document.getElementById('new-question-text').value.trim();
    const questionType = document.querySelector('input[name="question-type"]:checked').value;
    let newQuestion = {};

    if (questionType === 'multiple-choice') {
        const checkType = document.querySelector('input[name="check-type"]:checked').value;
        const choiceNodes = document.querySelectorAll('#choices-editor-area .choice-text');
        const choices = Array.from(choiceNodes).map(input => input.value.trim());
        const correctInputs = document.querySelectorAll('#choices-editor-area input[name="correct-answer"]:checked');
        if (choiceNodes.length < 2 || !questionText || choices.some(c => c === '') || correctInputs.length === 0) {
            alert('問題文とすべての選択肢を入力し、正解を1つ以上選択してください。'); return;
        }
        const correctAnswers = Array.from(correctInputs).map(input => choices[parseInt(input.value, 10)]);
        newQuestion = { type: 'multiple-choice', checkType: checkType, question: questionText, choices: choices, answer: correctAnswers };
    } else {
        const answerText = document.getElementById('text-answer-input').value.trim();
        if (!questionText || !answerText) { alert('問題文と正解のテキストを入力してください。'); return; }
        const correctAnswers = answerText.split(',').map(ans => ans.trim()).filter(ans => ans);
        newQuestion = { type: 'text-input', question: questionText, answer: correctAnswers };
    }
    newQuizQuestions.push(newQuestion);
    renderPreviewList();
    clearQuestionForm();
}

function addChoiceInput(text = '') {
    const choicesEditor = document.getElementById('choices-editor-area');
    const choiceCount = choicesEditor.getElementsByClassName('choice-input-group').length;
    const checkType = document.querySelector('input[name="check-type"]:checked').value;

    const newChoiceGroup = document.createElement('div');
    newChoiceGroup.className = 'choice-input-group';
    
    const input = document.createElement('input');
    input.type = (checkType === 'single') ? 'radio' : 'checkbox';
    input.name = 'correct-answer';
    input.value = choiceCount;
    if (choiceCount === 0 && checkType === 'single') { input.checked = true; }

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'choice-text';
    textInput.placeholder = `選択肢${choiceCount + 1}`;
    textInput.value = text;

    newChoiceGroup.appendChild(input);
    newChoiceGroup.appendChild(textInput);
    
    if (choiceCount >= 2) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-choice-btn';
        removeBtn.textContent = '削除';
        removeBtn.onclick = function() {
            newChoiceGroup.remove();
            const remainingGroups = choicesEditor.querySelectorAll('.choice-input-group');
            remainingGroups.forEach((group, index) => {
                group.querySelector('input[name="correct-answer"]').value = index;
            });
        };
        newChoiceGroup.appendChild(removeBtn);
    }
    choicesEditor.appendChild(newChoiceGroup);
}

function toggleQuestionTypeForm() {
    const questionType = document.querySelector('input[name="question-type"]:checked').value;
    document.getElementById('multiple-choice-area').classList.toggle('hidden', questionType !== 'multiple-choice');
    document.getElementById('text-input-answer-area').classList.toggle('hidden', questionType !== 'text-input');
}

function toggleChoiceInputType() {
    const choicesEditor = document.getElementById('choices-editor-area');
    const currentTexts = Array.from(choicesEditor.querySelectorAll('.choice-text')).map(input => input.value);
    choicesEditor.innerHTML = '';
    if (currentTexts.length > 0) {
        currentTexts.forEach(text => addChoiceInput(text));
    } else {
        addChoiceInput(); addChoiceInput();
    }
}

function goToNextQuestion() {
    setTimeout(() => {
        const submitBtn = document.getElementById('submit-answer-button');
        submitBtn.disabled = false;
        submitBtn.classList.remove('correct-answer', 'incorrect-answer');
        
        const userAnswerText = document.getElementById('user-answer-text');
        userAnswerText.disabled = false;
        userAnswerText.value = '';
        userAnswerText.classList.remove('correct-answer', 'incorrect-answer');

        currentQuizIndex++;
        if (currentQuizIndex < currentQuizzesData.quizzes.length) {
            showQuiz();
        } else {
            showResult();
        }
    }, 2500);
}


// ===== レベルアップシステム関連の関数 =====
function updatePlayerUI() {
    if (!currentUserData || typeof currentUserData.level === 'undefined') return;

    // ★★★ ここから変更 ★★★
    if (currentUser.isAnonymous) {
        // 匿名ユーザーの場合の表示
        document.getElementById('user-name').textContent = "ゲスト";
        document.getElementById('user-title').textContent = ""; // 称号は非表示
        document.getElementById('level-display').classList.add('hidden'); // レベルとEXPを非表示
    } else {
        // Googleログインユーザーの場合の表示
        document.getElementById('level-display').classList.remove('hidden'); // レベルとEXPを表示

        const level = currentUserData.level;
        const currentExp = currentUserData.exp;
        const nextLevelExp = getNextLevelExp(level);
        const prevLevelExp = getNextLevelExp(level - 1);
        
        const expForThisLevel = currentExp - prevLevelExp;
        const expNeededForNextLevel = nextLevelExp - prevLevelExp;

        document.getElementById('user-name').textContent = currentUser.displayName;
        document.getElementById('user-level').textContent = level;
        document.getElementById('exp-bar').value = expForThisLevel;
        document.getElementById('exp-bar').max = expNeededForNextLevel;
        document.getElementById('exp-text').textContent = `${expForThisLevel} / ${expNeededForNextLevel}`;
        
        document.getElementById('user-title').textContent = getTitle(level);
    }
    // ★★★ ここまで変更 ★★★
}
async function calculateAndUpdateExp() {
    if (currentUser.isAnonymous) {
        document.getElementById('result-exp-area').classList.add('hidden');
        return; // 匿名ユーザーの場合はここで処理を終了
    }
    document.getElementById('result-exp-area').classList.remove('hidden');
    
    // ...以降の経験値計算ロジックは変更なし...
    const totalQuestions = currentQuizzesData.quizzes.length;
    const baseExp = 10;
    const correctBonus = score * 5;
    const perfectBonus = (score === totalQuestions) ? 20 : 0;
    const totalEarnedExp = baseExp + correctBonus + perfectBonus;

    document.getElementById('earned-exp-text').textContent = `+${totalEarnedExp} EXP`;
    document.getElementById('level-up-text').classList.add('hidden');

    currentUserData.exp += totalEarnedExp;

    let leveledUp = false;
    let newLevel = currentUserData.level;
    while (currentUserData.exp >= getNextLevelExp(newLevel)) {
        newLevel++;
        leveledUp = true;
    }

    if (leveledUp) {
        const oldLevel = currentUserData.level;
        currentUserData.level = newLevel;
        const levelUpText = document.getElementById('level-up-text');
        levelUpText.textContent = `レベルアップ！ Lv.${oldLevel} → Lv.${newLevel}`;
        levelUpText.classList.remove('hidden');
    }

    await usersCollection.doc(currentUser.uid).update({
        level: currentUserData.level,
        exp: currentUserData.exp
    });

    updatePlayerUI();
}

function getNextLevelExp(level) {
    if (level <= 0) return 0;
    if (level < EXP_TABLE.length) {
        return EXP_TABLE[level];
    }
    const lastTableLevel = EXP_TABLE.length - 1;
    const baseExp = EXP_TABLE[lastTableLevel];
    const extraLevels = level - lastTableLevel;
    return baseExp + extraLevels * (250 + lastTableLevel * 50);
}

function getTitle(level) {
    let currentTitle = "駆け出し";
    const sortedLevels = Object.keys(TITLES).map(Number).sort((a, b) => a - b);
    for (const levelKey of sortedLevels) {
        if (level >= levelKey) {
            currentTitle = TITLES[levelKey];
        } else {
            break;
        }
    }
    return currentTitle;
}       
