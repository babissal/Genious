"use strict";

// ----- Σταθερές -----
const TEAM_COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#da77f2", "#ff922b"];
// Πόντοι ανά επίπεδο δυσκολίας (1=εύκολη, 2=μέτρια, 3=δύσκολη)
const POINTS_BY_DIFFICULTY = { 1: 100, 2: 150, 3: 250 };
const DIFFICULTY_LABELS = { 1: "Εύκολη", 2: "Μέτρια", 3: "Δύσκολη" };
const BONUS_PER_SECOND = 5;       // μπόνους ανά δευτερόλεπτο που απομένει στην αποκάλυψη

// ----- Κατάσταση παιχνιδιού -----
const state = {
  teams: [],            // { name, color, score }
  questions: [],        // λίστα ερωτήσεων του παιχνιδιού
  current: 0,           // δείκτης τρέχουσας ερώτησης
  questionsPerTeam: 0,  // ερωτήσεις ανά ομάδα
  timerSeconds: 20,
  timeBonus: true,
  timeLeft: 0,
  intervalId: null,
  revealed: false,      // έχει αποκαλυφθεί η απάντηση;
  judged: false,        // έχει κριθεί σωστή/λάθος;
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

// Χτίζει τη λίστα ερωτήσεων ώστε κάθε ομάδα να έχει την ίδια σύνθεση δυσκολίας.
function buildBalancedQuestions(cats, perTeam, numTeams) {
  const fullByLevel = { 1: [], 2: [], 3: [] };
  QUESTIONS.forEach((q) => {
    if (cats.includes(q.category)) fullByLevel[q.d].push(q);
  });

  const levels = [1, 2, 3].filter((l) => fullByLevel[l].length > 0);
  const buckets = {};
  levels.forEach((l) => { buckets[l] = shuffle(fullByLevel[l]); });

  // Πόσες ερωτήσεις κάθε δυσκολίας ανά ομάδα — όσο πιο ισομερώς γίνεται.
  const counts = {};
  const baseCount = Math.floor(perTeam / levels.length);
  levels.forEach((l) => { counts[l] = baseCount; });
  const leftover = perTeam - baseCount * levels.length;
  for (let i = 0; i < leftover; i++) counts[levels[i]]++;

  // Τραβάει ερώτηση δυσκολίας level· αν αδειάσει ο κουβάς, ανακυκλώνει.
  function draw(level) {
    if (buckets[level].length === 0) buckets[level] = shuffle(fullByLevel[level]);
    return buckets[level].pop();
  }

  const selected = [];
  for (let t = 0; t < numTeams; t++) {
    const teamQs = [];
    levels.forEach((l) => {
      for (let i = 0; i < counts[l]; i++) teamQs.push(draw(l));
    });
    shuffle(teamQs).forEach((q) => selected.push(q));
  }
  return selected;
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

  // Δεξαμενή ερωτήσεων από τις επιλεγμένες κατηγορίες
  if (QUESTIONS.filter((q) => cats.includes(q.category)).length === 0) {
    errorEl.textContent = "Δεν υπάρχουν ερωτήσεις στις επιλεγμένες κατηγορίες.";
    errorEl.hidden = false;
    return;
  }

  // Ισορροπημένη επιλογή: κάθε ομάδα παίρνει την ίδια σύνθεση δυσκολίας.
  const selected = buildBalancedQuestions(cats, perTeam, teams.length);

  state.teams = teams;
  state.questions = selected;
  state.current = 0;
  state.questionsPerTeam = perTeam;
  state.timerSeconds = parseInt($("timer-seconds").value, 10);
  state.timeBonus = $("time-bonus").checked;

  showScreen("screen-game");
  renderQuestion();
}

// ===================== ΟΘΟΝΗ ΠΑΙΧΝΙΔΙΟΥ =====================

function currentTeamIndex() {
  // Κάθε ομάδα ολοκληρώνει όλες τις ερωτήσεις της πριν ξεκινήσει η επόμενη.
  return Math.floor(state.current / state.questionsPerTeam);
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
      '<span class="tname">' + escapeHtml(t.name) + "</span>" +
      '<span class="pts">' + t.score + "</span>";
    container.appendChild(chip);
  });
}

function renderQuestion() {
  state.revealed = false;
  state.judged = false;

  const q = state.questions[state.current];
  const team = state.teams[currentTeamIndex()];
  const questionInTeam = (state.current % state.questionsPerTeam) + 1;

  // Topbar
  const ct = $("current-team");
  ct.textContent = team.name;
  ct.style.color = team.color;
  $("round-info").textContent = "Ερώτηση " + questionInTeam + " / " + state.questionsPerTeam;

  renderScoreboardMini();

  // Ερώτηση
  $("category-badge").textContent = q.category;
  const diffBadge = $("difficulty-badge");
  diffBadge.textContent = DIFFICULTY_LABELS[q.d] + " · " + (POINTS_BY_DIFFICULTY[q.d] || 100) + " πόντοι";
  diffBadge.className = "badge diff diff-" + q.d;
  $("question-text").textContent = q.q;

  // Επαναφορά UI
  $("btn-reveal").hidden = false;
  $("answer-reveal").hidden = true;
  $("answer-text").textContent = "";
  $("judge-buttons").hidden = true;
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
      revealAnswer(); // λήξη χρόνου -> αυτόματη αποκάλυψη
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

function revealAnswer() {
  if (state.revealed) return;
  state.revealed = true;
  clearInterval(state.intervalId);

  const q = state.questions[state.current];
  $("answer-text").textContent = q.answer;
  $("answer-reveal").hidden = false;
  $("btn-reveal").hidden = true;
  $("judge-buttons").hidden = false;
}

function judgeAnswer(isCorrect) {
  if (!state.revealed || state.judged) return;
  state.judged = true;

  const q = state.questions[state.current];
  const team = state.teams[currentTeamIndex()];
  const fb = $("feedback");

  if (isCorrect) {
    let earned = POINTS_BY_DIFFICULTY[q.d] || 100;
    if (state.timeBonus) earned += state.timeLeft * BONUS_PER_SECOND;
    team.score += earned;
    fb.textContent = "✅ Σωστά! +" + earned + " πόντοι για «" + team.name + "»";
    fb.classList.add("good");
  } else {
    fb.textContent = "❌ Λάθος. Καμία αλλαγή στους πόντους της ομάδας «" + team.name + "»";
    fb.classList.add("bad");
  }
  fb.hidden = false;

  $("judge-buttons").hidden = true;
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
  $("btn-reveal").addEventListener("click", revealAnswer);
  $("btn-correct").addEventListener("click", () => judgeAnswer(true));
  $("btn-wrong").addEventListener("click", () => judgeAnswer(false));
  $("btn-next").addEventListener("click", nextQuestion);
  $("btn-restart").addEventListener("click", restart);
});
