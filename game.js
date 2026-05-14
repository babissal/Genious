"use strict";

// ----- Σταθερές -----
const TEAM_COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#da77f2", "#ff922b"];
const BASE_POINTS = 100;          // πόντοι για σωστή απάντηση
const BONUS_PER_SECOND = 5;       // μπόνους ανά δευτερόλεπτο που απομένει

// ----- Κατάσταση παιχνιδιού -----
const state = {
  teams: [],            // { name, color, score }
  questions: [],        // λίστα ερωτήσεων του παιχνιδιού (με ανακατεμένες επιλογές)
  current: 0,           // δείκτης τρέχουσας ερώτησης
  timerSeconds: 20,
  timeBonus: true,
  timeLeft: 0,
  intervalId: null,
  answered: false,
};

// ----- Βοηθητικά -----
function $(id) { return document.getElementById(id); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

function getCategories() {
  return [...new Set(QUESTIONS.map((q) => q.category))];
}

// ===================== ΟΘΟΝΗ ΡΥΘΜΙΣΕΩΝ =====================

function renderTeamNameInputs() {
  const count = parseInt($("team-count").value, 10);
  const container = $("team-names");
  const existing = {};
  container.querySelectorAll("input").forEach((inp, i) => { existing[i] = inp.value; });

  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "team-name-row";

    const dot = document.createElement("span");
    dot.className = "team-dot";
    dot.style.background = TEAM_COLORS[i];

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.placeholder = "Όνομα ομάδας " + (i + 1);
    input.value = existing[i] || "Ομάδα " + (i + 1);

    row.appendChild(dot);
    row.appendChild(input);
    container.appendChild(row);
  }
}

function renderCategoryList() {
  const container = $("category-list");
  container.innerHTML = "";
  getCategories().forEach((cat) => {
    const count = QUESTIONS.filter((q) => q.category === cat).length;
    const label = document.createElement("label");
    label.className = "category-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = cat;
    cb.checked = true;

    const name = document.createElement("span");
    name.textContent = cat;

    const cnt = document.createElement("span");
    cnt.className = "count";
    cnt.textContent = count;

    label.appendChild(cb);
    label.appendChild(name);
    label.appendChild(cnt);
    container.appendChild(label);
  });
}

function getSelectedCategories() {
  return [...document.querySelectorAll("#category-list input:checked")].map((cb) => cb.value);
}

function startGame() {
  const errorEl = $("setup-error");
  errorEl.hidden = true;

  // Ομάδες
  const teams = [];
  document.querySelectorAll("#team-names input").forEach((inp, i) => {
    const name = inp.value.trim() || "Ομάδα " + (i + 1);
    teams.push({ name, color: TEAM_COLORS[i], score: 0 });
  });

  // Κατηγορίες
  const cats = getSelectedCategories();
  if (cats.length === 0) {
    errorEl.textContent = "Διάλεξε τουλάχιστον μία κατηγορία ερωτήσεων.";
    errorEl.hidden = false;
    return;
  }

  const perTeam = parseInt($("questions-per-team").value, 10);
  const totalNeeded = perTeam * teams.length;

  // Δεξαμενή ερωτήσεων από τις επιλεγμένες κατηγορίες
  let pool = shuffle(QUESTIONS.filter((q) => cats.includes(q.category)));
  if (pool.length === 0) {
    errorEl.textContent = "Δεν υπάρχουν ερωτήσεις στις επιλεγμένες κατηγορίες.";
    errorEl.hidden = false;
    return;
  }

  // Αν δεν φτάνουν, ανακυκλώνουμε ώστε να καλυφθεί ο αριθμός
  const selected = [];
  while (selected.length < totalNeeded) {
    if (pool.length === 0) pool = shuffle(QUESTIONS.filter((q) => cats.includes(q.category)));
    selected.push(pool.pop());
  }

  // Ανακάτεμα των επιλογών κάθε ερώτησης
  state.questions = selected.map((q) => {
    const correctText = q.options[q.correct];
    const opts = shuffle(q.options);
    return {
      category: q.category,
      q: q.q,
      options: opts,
      correct: opts.indexOf(correctText),
    };
  });

  state.teams = teams;
  state.current = 0;
  state.timerSeconds = parseInt($("timer-seconds").value, 10);
  state.timeBonus = $("time-bonus").checked;

  showScreen("screen-game");
  renderQuestion();
}

// ===================== ΟΘΟΝΗ ΠΑΙΧΝΙΔΙΟΥ =====================

function currentTeamIndex() {
  return state.current % state.teams.length;
}

function renderScoreboardMini() {
  const container = $("scoreboard-mini");
  container.innerHTML = "";
  const activeIdx = currentTeamIndex();
  state.teams.forEach((t, i) => {
    const chip = document.createElement("div");
    chip.className = "score-chip" + (i === activeIdx ? " active" : "");
    chip.innerHTML =
      '<span class="dot" style="background:' + t.color + '"></span>' +
      '<span class="tname">' + escapeHtml(t.name) + '</span>' +
      '<span class="pts">' + t.score + '</span>';
    container.appendChild(chip);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderQuestion() {
  state.answered = false;
  const q = state.questions[state.current];
  const team = state.teams[currentTeamIndex()];
  const roundNum = Math.floor(state.current / state.teams.length) + 1;
  const totalRounds = state.questions.length / state.teams.length;

  // Topbar
  const ct = $("current-team");
  ct.textContent = team.name;
  ct.style.color = team.color;
  $("round-info").textContent = "Γύρος " + roundNum + " / " + totalRounds;

  renderScoreboardMini();

  // Ερώτηση
  $("category-badge").textContent = q.category;
  $("question-text").textContent = q.q;

  // Απαντήσεις
  const answersEl = $("answers");
  answersEl.innerHTML = "";
  const letters = ["Α", "Β", "Γ", "Δ"];
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.innerHTML = '<span class="letter">' + letters[i] + "</span>" + escapeHtml(opt);
    btn.addEventListener("click", () => handleAnswer(i));
    answersEl.appendChild(btn);
  });

  // Επαναφορά feedback / κουμπιού
  const fb = $("feedback");
  fb.hidden = true;
  fb.className = "feedback";
  $("btn-next").hidden = true;

  startTimer();
}

function startTimer() {
  clearInterval(state.intervalId);
  state.timeLeft = state.timerSeconds;
  updateTimerUI();
  state.intervalId = setInterval(() => {
    state.timeLeft--;
    updateTimerUI();
    if (state.timeLeft <= 0) {
      clearInterval(state.intervalId);
      handleAnswer(-1); // λήξη χρόνου
    }
  }, 1000);
}

function updateTimerUI() {
  const timerEl = $("timer");
  const barEl = $("timer-bar");
  timerEl.textContent = state.timeLeft;
  const pct = Math.max(0, (state.timeLeft / state.timerSeconds) * 100);
  barEl.style.width = pct + "%";
  const low = state.timeLeft <= 5;
  timerEl.classList.toggle("low", low);
  barEl.classList.toggle("low", low);
}

function handleAnswer(choiceIndex) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.intervalId);

  const q = state.questions[state.current];
  const team = state.teams[currentTeamIndex()];
  const buttons = [...document.querySelectorAll(".answer-btn")];
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add("correct");
    if (i === choiceIndex && i !== q.correct) b.classList.add("wrong");
  });

  const fb = $("feedback");
  const isCorrect = choiceIndex === q.correct;
  const timedOut = choiceIndex === -1;

  if (isCorrect) {
    let earned = BASE_POINTS;
    if (state.timeBonus) earned += state.timeLeft * BONUS_PER_SECOND;
    team.score += earned;
    fb.textContent = "✅ Σωστά! +" + earned + " πόντοι για «" + team.name + "»";
    fb.classList.add("good");
  } else if (timedOut) {
    fb.textContent = "⏱ Τέλος χρόνου! Σωστή απάντηση: " + q.options[q.correct];
    fb.classList.add("bad");
  } else {
    fb.textContent = "❌ Λάθος. Σωστή απάντηση: " + q.options[q.correct];
    fb.classList.add("bad");
  }
  fb.hidden = false;

  renderScoreboardMini();

  const nextBtn = $("btn-next");
  nextBtn.hidden = false;
  nextBtn.textContent =
    state.current + 1 >= state.questions.length ? "Δες αποτελέσματα 🏆" : "Επόμενη ➜";
}

function nextQuestion() {
  state.current++;
  if (state.current >= state.questions.length) {
    showEndScreen();
  } else {
    renderQuestion();
  }
}

// ===================== ΟΘΟΝΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ =====================

function showEndScreen() {
  clearInterval(state.intervalId);
  const ranked = state.teams
    .map((t, i) => ({ ...t, idx: i }))
    .sort((a, b) => b.score - a.score);

  const topScore = ranked[0].score;
  const winners = ranked.filter((t) => t.score === topScore);

  const banner = $("winner-banner");
  if (winners.length > 1) {
    banner.textContent = "🤝 Ισοπαλία! " + winners.map((w) => w.name).join(" & ") + " — " + topScore + " πόντοι";
  } else {
    banner.textContent = "🏆 Νικητής: " + winners[0].name + " με " + topScore + " πόντους!";
  }

  const list = $("final-scoreboard");
  list.innerHTML = "";
  ranked.forEach((t) => {
    const li = document.createElement("li");
    if (t.score === topScore) li.classList.add("first");
    li.innerHTML =
      '<span class="team-dot" style="background:' + t.color + '"></span>' +
      '<span class="name">' + escapeHtml(t.name) + "</span>" +
      '<span class="score">' + t.score + " π.</span>";
    list.appendChild(li);
  });

  showScreen("screen-end");
}

function restart() {
  showScreen("screen-setup");
}

// ===================== ΑΡΧΙΚΟΠΟΙΗΣΗ =====================

document.addEventListener("DOMContentLoaded", () => {
  renderTeamNameInputs();
  renderCategoryList();

  $("team-count").addEventListener("change", renderTeamNameInputs);
  $("btn-start").addEventListener("click", startGame);
  $("btn-next").addEventListener("click", nextQuestion);
  $("btn-restart").addEventListener("click", restart);
});
