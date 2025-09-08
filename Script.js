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
const usersCollection = db.collection('users');
const threadsCollection = db.collection('threads'); // ★新設★


// ===== ゲーム内設定 =====
const TITLES = {
    1: "駆け出し", 5: "クイズ初心者", 10: "クイズ愛好家", 20: "クイズの探求者",
    30: "クイズマスター", 50: "歩くデータベース", 75: "クイズの賢者", 100: "クイズ神"
};

const EXP_TABLE = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250];


// HTML要素を取得
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const quizPage = document.getElementById('quiz-page');
const resultPage = document.getElementById('result-page');
const createPage = document.getElementById('create-page');
const forumPage = document.getElementById('forum-page');
const threadViewPage = document.getElementById('thread-view-page');


// イベントリスナー
document.getElementById('login-button').addEventListener('click', signInWithGoogle);
document.getElementById('anonymous-login-button').addEventListener('click', signInAnonymously);
document.getElementById('logout-button').addEventListener('click', signOut);
document.getElementById('save-quiz-button').addEventListener('click', saveQuiz);
document.getElementById('show-create-page-button').addEventListener('click', showCreatePage);
document.getElementById('back-to-main-from-create-button').addEventListener('click', showMainPage);
document.getElementById('back-to-main-button').addEventListener('click', showMainPage);
document.getElementById('back-to-main-from-result-button').addEventListener('click', showMainPage);
document.getElementById('play-again-button').addEventListener('click', () => startGame(currentQuizzesData));
document.getElementById('add-question-button').addEventListener('click', addQuestionToList);
document.getElementById('add-choice-button').addEventListener('click', () => addChoiceInput());
document.querySelectorAll('input[name="question-type"]').forEach(radio => radio.addEventListener('change', toggleQuestionTypeForm));
document.getElementById('submit-answer-button').addEventListener('click', submitAndCheckAnswer);
document.querySelectorAll('input[name="check-type"]').forEach(radio => radio.addEventListener('change', toggleChoiceInputType));
// ★掲示板用イベントリスナー★
document.getElementById('show-forum-button').addEventListener('click', showForumPage);
document.getElementById('back-to-main-from-forum-button').addEventListener('click', showMainPage);
document.getElementById('post-thread-button').addEventListener('click', postNewThread);
document.getElementById('back-to-forum-button').addEventListener('click', showForumPage);
document.getElementById('post-reply-button').addEventListener('click', postReply);


// ゲーム状態を管理する変数
let currentUser = null;
let currentUserData = {};
let currentQuizzesData = null;
let currentQuizIndex = 0;
let score = 0;
let newQuizQuestions = [];
let currentThreadId = null; // ★新設★ 表示中のスレッドID


// ===== 認証処理 =====
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error(error));
}

function signInAnonymously() {
    auth.signInAnonymously().catch(error => console.error(error));
}

function signOut() {
    auth.signOut();
}

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        if (user.isAnonymous) {
            currentUserData = { displayName: "ゲスト", level: 1, exp: 0 };
        } else {
            await loadOrCreateUserData(user);
        }
        updatePlayerUI();
        showMainPage();
    } else {
        currentUser = null;
        currentUserData = {};
        // 全ページを非表示にしてログイン画面へ
        const allPages = [mainPage, quizPage, resultPage, createPage, forumPage, threadViewPage];
        allPages.forEach(page => page.classList.add('hidden'));
        loginPage.classList.remove('hidden');
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

// ... (Firestoreのクイズ処理、ゲームロジックは前回のコードとほぼ同じ) ...
// (一部関数名を明確にするため微修正)
// ===== ここからは前回のコードと大きく異なる部分 =====


// ===== ページ表示/UIヘルパー関数 =====
function hideAllPages() {
    [loginPage, mainPage, quizPage, resultPage, createPage, forumPage, threadViewPage].forEach(p => p.classList.add('hidden'));
}

function showMainPage() {
    hideAllPages();
    mainPage.classList.remove('hidden');
    updatePlayerUI();
    loadQuizzes();
}

function showCreatePage() {
    hideAllPages();
    createPage.classList.remove('hidden');
    // ... (フォーム初期化処理は変更なし) ...
}

function showForumPage() {
    hideAllPages();
    forumPage.classList.remove('hidden');
    
    // 匿名ユーザーはスレッド作成フォームを非表示にする
    const createThreadArea = document.getElementById('create-thread-area');
    createThreadArea.style.display = currentUser.isAnonymous ? 'none' : 'block';
    
    loadThreads();
}

async function showThreadViewPage(threadId) {
    hideAllPages();
    threadViewPage.classList.remove('hidden');
    currentThreadId = threadId;

    // 匿名ユーザーは返信フォームを非表示にする
    const replyFormArea = document.getElementById('reply-form-area');
    replyFormArea.style.display = currentUser.isAnonymous ? 'none' : 'block';

    // スレッドの元の投稿を表示
    const threadRef = threadsCollection.doc(threadId);
    const doc = await threadRef.get();
    if (doc.exists) {
        const thread = doc.data();
        const opDiv = document.getElementById('original-post');
        opDiv.innerHTML = `
            <h3>${thread.title}</h3>
            <div class="post-header">
                <strong>${thread.authorName}</strong>
                <small> - ${new Date(thread.createdAt.seconds * 1000).toLocaleString()}</small>
            </div>
            <div class="post-content">${thread.content}</div>
        `;
    }

    // 返信一覧を読み込み
    loadReplies(threadId);
}


// ===== 掲示板データ処理 =====
async function postNewThread() {
    const title = document.getElementById('thread-title-input').value.trim();
    const content = document.getElementById('thread-content-input').value.trim();

    if (!title || !content) {
        alert('タイトルと内容を入力してください。');
        return;
    }

    try {
        await threadsCollection.add({
            title: title,
            content: content,
            authorId: currentUser.uid,
            authorName: currentUserData.displayName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastReplyAt: firebase.firestore.FieldValue.serverTimestamp(), // 更新順ソート用
            replyCount: 0
        });
        document.getElementById('thread-title-input').value = '';
        document.getElementById('thread-content-input').value = '';
        loadThreads();
    } catch (error) {
        console.error("Error adding thread: ", error);
        alert('スレッドの投稿に失敗しました。');
    }
}

async function loadThreads() {
    const threadListDiv = document.getElementById('thread-list');
    threadListDiv.innerHTML = '<p>スレッドを読み込んでいます...</p>';
    const snapshot = await threadsCollection.orderBy('lastReplyAt', 'desc').get();
    threadListDiv.innerHTML = '';

    if (snapshot.empty) {
        threadListDiv.innerHTML = '<p>まだスレッドがありません。</p>';
        return;
    }

    snapshot.forEach(doc => {
        const thread = doc.data();
        const item = document.createElement('div');
        item.className = 'thread-item';
        item.onclick = () => showThreadViewPage(doc.id);
        item.innerHTML = `
            <h5>${thread.title}</h5>
            <div class="thread-meta">
                作成者: ${thread.authorName} | 返信: ${thread.replyCount} | 最終更新: ${new Date(thread.lastReplyAt.seconds * 1000).toLocaleString()}
            </div>
        `;
        threadListDiv.appendChild(item);
    });
}

async function postReply() {
    const content = document.getElementById('reply-content-input').value.trim();
    if (!content) {
        alert('返信内容を入力してください。');
        return;
    }

    const threadRef = threadsCollection.doc(currentThreadId);
    const repliesRef = threadRef.collection('replies');

    try {
        // 返信をサブコレクションに追加
        await repliesRef.add({
            content: content,
            authorId: currentUser.uid,
            authorName: currentUserData.displayName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // スレッド本体の更新日時と返信数を更新
        await threadRef.update({
            lastReplyAt: firebase.firestore.FieldValue.serverTimestamp(),
            replyCount: firebase.firestore.FieldValue.increment(1)
        });

        document.getElementById('reply-content-input').value = '';
        loadReplies(currentThreadId); // 返信リストを再読み込み
    } catch (error) {
        console.error("Error adding reply: ", error);
        alert('返信の投稿に失敗しました。');
    }
}

async function loadReplies(threadId) {
    const repliesListDiv = document.getElementById('replies-list');
    repliesListDiv.innerHTML = '';
    const repliesRef = threadsCollection.doc(threadId).collection('replies');
    const snapshot = await repliesRef.orderBy('createdAt', 'asc').get();

    if (snapshot.empty) {
        repliesListDiv.innerHTML = '<p>まだ返信はありません。</p>';
        return;
    }

    snapshot.forEach(doc => {
        const reply = doc.data();
        const item = document.createElement('div');
        item.className = 'reply-item';
        item.innerHTML = `
            <div class="post-header">
                <strong>${reply.authorName}</strong>
                <small> - ${new Date(reply.createdAt.seconds * 1000).toLocaleString()}</small>
            </div>
            <div class="post-content">${reply.content}</div>
        `;
        repliesListDiv.appendChild(item);
    });
}


// (ここから下は、前回の完成版JSからコピー＆ペーストでOKです。変更はありません)
// (saveQuiz, loadQuizzes, deleteQuiz, startGame, showQuiz, checkAnswer, submitAndCheckAnswer, showAnswerFeedback, showResult, clearQuestionForm, renderPreviewList, addQuestionToList, addChoiceInput, toggleQuestionTypeForm, toggleChoiceInputType, goToNextQuestion, updatePlayerUI, calculateAndUpdateExp, getNextLevelExp, getTitle)
// (ただし、showMainPage と showCreatePage は上記の新しいものに置き換えてください)

// ... (以下、省略していたコードの全文) ...
async function saveQuiz() {
    const title = document.getElementById('quiz-title').value;
    if (!title.trim()) { alert('クイズ全体のタイトルを入力してください。'); return; }
    if (newQuizQuestions.length === 0) { alert('問題が1つもありません。最低1問は追加してください。'); return; }

    try {
        await quizzesCollection.add({
            title: title, quizzes: newQuizQuestions,
            authorName: currentUserData.displayName, authorId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('クイズを投稿しました！');
        showMainPage();
    } catch (error) {
        alert('クイズの投稿に失敗しました。');
        console.error(error);
    }
}

function startGame(data) {
    currentQuizzesData = data;
    currentQuizIndex = 0;
    score = 0;
    hideAllPages();
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
    }

    if(quiz.type === 'multiple-choice' && quiz.checkType !== 'single') {
        document.querySelectorAll('.choice-checkbox-item').forEach(item => {
            const checkbox = item.querySelector('input');
            if (checkbox.checked && !correctAnswers.includes(checkbox.value)) {
                item.classList.add('incorrect-answer');
            }
            checkbox.disabled = true;
        });
    } else if (quiz.type === 'text-input') {
        const inputField = document.getElementById('user-answer-text');
        if (!isCorrect) {
            inputField.classList.add('incorrect-answer');
        }
    }
}

function showResult() {
    hideAllPages();
    resultPage.classList.remove('hidden');
    document.getElementById('score-text').textContent = `あなたは ${currentQuizzesData.quizzes.length}問中 ${score}問 正解しました！`;
    calculateAndUpdateExp();
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

function updatePlayerUI() {
    if (!currentUserData || typeof currentUserData.level === 'undefined') return;

    if (currentUser.isAnonymous) {
        document.getElementById('user-name').textContent = "ゲスト";
        document.getElementById('user-title').textContent = "";
        document.getElementById('level-display').classList.add('hidden');
    } else {
        document.getElementById('level-display').classList.remove('hidden');
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
}

async function calculateAndUpdateExp() {
    if (currentUser.isAnonymous) {
        document.getElementById('result-exp-area').classList.add('hidden');
        return;
    }
    document.getElementById('result-exp-area').classList.remove('hidden');
    
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
    if (level < EXP_TABLE.length) { return EXP_TABLE[level]; }
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
};
