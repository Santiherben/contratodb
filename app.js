// Runtime-configurable Supabase keys. Create a non-committed `config.js`
// from `config.example.js` and define these globals there.
const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
const APP_URL = window.APP_URL || "https://santiherben.github.io/contratodb/";

const isConfigured = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 40;
const db = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let session = null;
let currentProfile = null;
let isRecoveringPassword = false;
let state = {
  teams: [],
  students: [],
  deliveries: [],
  payments: {},
};

const setupPanel = document.querySelector("#setupPanel");
const authPanel = document.querySelector("#authPanel");
const passwordResetPanel = document.querySelector("#passwordResetPanel");
const passwordResetForm = document.querySelector("#passwordResetForm");
const passwordResetMessage = document.querySelector("#passwordResetMessage");
const newPassword = document.querySelector("#newPassword");
const newPasswordConfirm = document.querySelector("#newPasswordConfirm");
const appMain = document.querySelector("#appMain");
const authForm = document.querySelector("#authForm");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authName = document.querySelector("#authName");
const signupBtn = document.querySelector("#signupBtn");
const authMessage = document.querySelector("#authMessage");
const sessionBox = document.querySelector("#sessionBox");
const logoutBtn = document.querySelector("#logoutBtn");
const studentSelect = document.querySelector("#studentSelect");
const studentPickerWrap = document.querySelector("#studentPickerWrap");
const teacherPanel = document.querySelector("#teacherPanel");
const studentPanel = document.querySelector("#studentPanel");
const deliveriesAdmin = document.querySelector("#deliveriesAdmin");
const studentDeliveries = document.querySelector("#studentDeliveries");
const studentDashboard = document.querySelector("#studentDashboard");
const studentContract = document.querySelector("#studentContract");
const paymentForm = document.querySelector("#paymentForm");
const paymentDelivery = document.querySelector("#paymentDelivery");
const paymentTeam = document.querySelector("#paymentTeam");
const paymentScope = document.querySelector("#paymentScope");
const paymentMembers = document.querySelector("#paymentMembers");
const paymentCoins = document.querySelector("#paymentCoins");
const paymentPenalty = document.querySelector("#paymentPenalty");
const paymentFeedback = document.querySelector("#paymentFeedback");
const resetBtn = document.querySelector("#resetBtn");
const teamForm = document.querySelector("#teamForm");
const teamName = document.querySelector("#teamName");
const teamColor = document.querySelector("#teamColor");
const teamList = document.querySelector("#teamList");
const studentForm = document.querySelector("#studentForm");
const studentAccount = document.querySelector("#studentAccount");
const studentTeam = document.querySelector("#studentTeam");
const studentList = document.querySelector("#studentList");
const teacherMessage = document.querySelector("#teacherMessage");
const overviewTeam = document.querySelector("#overviewTeam");
const teamOverview = document.querySelector("#teamOverview");

function setMessage(message) {
  authMessage.textContent = message || "";
}

function setTeacherMessage(message) {
  teacherMessage.textContent = message || "";
}

function shortError(error) {
  if (!error) return "";
  const message = error.message || String(error);
  if (/redirect|url|site/i.test(message)) return "Revisá URL Configuration en Supabase.";
  if (/rate|limit/i.test(message)) return "Límite de emails alcanzado. Probá más tarde.";
  return message;
}

function isPasswordRecoveryLink() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("type") === "recovery" || window.location.search.includes("type=recovery");
}

function showPasswordResetPanel() {
  setupPanel.hidden = true;
  authPanel.hidden = true;
  passwordResetPanel.hidden = false;
  appMain.hidden = true;
  logoutBtn.hidden = true;
  studentPickerWrap.hidden = true;
  sessionBox.textContent = "";
}

function maxCoins() {
  return state.deliveries.reduce((total, delivery) => total + Number(delivery.coins), 0);
}

function earnedCoins(studentId) {
  const payments = state.payments[studentId] || {};
  return Object.values(payments).reduce((total, payment) => total + Number(payment.coins || 0), 0);
}

function progressFor(studentId) {
  const total = maxCoins();
  return total ? Math.round((earnedCoins(studentId) / total) * 100) : 0;
}

function gradeFor(progress) {
  if (progress >= 97) return 10;
  if (progress >= 90) return 9;
  if (progress >= 80) return 8;
  if (progress >= 70) return 7;
  if (progress >= 60) return 6;
  if (progress >= 50) return 5;
  if (progress >= 40) return 4;
  if (progress >= 30) return 3;
  if (progress >= 20) return 2;
  return 1;
}

function statusFor(grade) {
  if (grade >= 8) return "Solido";
  if (grade >= 5) return "Aceptable";
  return "Insuficiente";
}

function completedDeliveries(studentId) {
  const payments = state.payments[studentId] || {};
  return state.deliveries.filter((delivery) => payments[delivery.id]);
}

function nextDelivery(studentId) {
  const payments = state.payments[studentId] || {};
  return state.deliveries.find((delivery) => !payments[delivery.id]);
}

function riskFor(studentId) {
  const progress = progressFor(studentId);
  const paidDeliveries = completedDeliveries(studentId).length;
  const openDeliveries = state.deliveries.filter((delivery) =>
    ["Abierta", "Cerrada", "En revision", "Finalizada"].includes(delivery.status)
  ).length;

  if (progress >= 80) return { label: "Aprobacion encaminada", tone: "ok" };
  if (progress >= 50 && paidDeliveries >= Math.max(1, openDeliveries - 1)) return { label: "Al dia", tone: "ok" };
  if (progress >= 40 || paidDeliveries >= Math.max(0, openDeliveries - 2)) return { label: "Atencion", tone: "warn" };
  return { label: "En riesgo", tone: "bad" };
}

function selectedStudentId() {
  if (currentProfile?.role === "teacher") return studentSelect.value || state.students[0]?.id || "";
  return currentProfile?.id;
}

function getTeam(teamId) {
  return state.teams.find((team) => team.id === teamId) || { id: "", name: "Sin equipo", color: "#64748b" };
}

function formatDate(dateValue) {
  if (!dateValue) return "Sin fecha";
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

async function loadData() {
  const [{ data: teams }, { data: profiles }, { data: deliveries }, { data: payments }] = await Promise.all([
    db.from("teams").select("*").order("created_at"),
    db.from("profiles").select("*").order("full_name"),
    db.from("deliveries").select("*").order("sort_order"),
    db.from("payments").select("*"),
  ]);

  state.teams = (teams || []).map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
  }));
  state.students = (profiles || [])
    .filter((profile) => profile.role === "student")
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      teamId: profile.team_id,
      contractAcceptedAt: profile.contract_accepted_at,
    }));
  state.deliveries = (deliveries || []).map((delivery) => ({
    id: delivery.id,
    title: delivery.title,
    details: delivery.details,
    date: delivery.due_date,
    coins: delivery.max_coins,
    status: delivery.status,
  }));
  state.payments = {};
  (payments || []).forEach((payment) => {
    state.payments[payment.student_id] = state.payments[payment.student_id] || {};
    state.payments[payment.student_id][payment.delivery_id] = {
      coins: payment.coins,
      penalty: payment.penalty,
      feedback: payment.feedback,
    };
  });
}

async function loadProfile() {
  const { data, error } = await db.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) throw error;
  currentProfile = data;
}

function renderShell() {
  const isTeacher = currentProfile?.role === "teacher";
  setupPanel.hidden = true;
  authPanel.hidden = true;
  passwordResetPanel.hidden = true;
  appMain.hidden = false;
  logoutBtn.hidden = false;
  teacherPanel.hidden = !isTeacher;
  studentPanel.hidden = isTeacher && state.students.length === 0;
  studentPickerWrap.hidden = !isTeacher || state.students.length === 0;
  sessionBox.innerHTML = `
    <strong>${currentProfile.full_name}</strong>
    <span>${isTeacher ? "Docente" : "Estudiante"}</span>
  `;
}

function renderOptions() {
  const studentOptions = state.students.length
    ? state.students
        .map((student) => {
          const team = getTeam(student.teamId);
          return `<option value="${student.id}">${student.name} - ${team.name}</option>`;
        })
        .join("")
    : '<option value="">Sin estudiantes registrados</option>';
  const teamOptions = state.teams.length
    ? state.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join("")
    : '<option value="">Sin equipos creados</option>';
  studentSelect.innerHTML = studentOptions;
  studentAccount.innerHTML = state.students
    .map((student) => `<option value="${student.id}">${student.name} · ${student.email}</option>`)
    .join("");
  if (!state.students.length) {
    studentAccount.innerHTML = '<option value="">No hay cuentas estudiante</option>';
  }
  studentTeam.innerHTML = teamOptions;
  overviewTeam.innerHTML = teamOptions;
  paymentTeam.innerHTML = teamOptions;
  paymentDelivery.innerHTML = state.deliveries
    .map((delivery) => `<option value="${delivery.id}">${delivery.title}</option>`)
    .join("");
  studentSelect.disabled = state.students.length === 0;
  studentAccount.disabled = state.students.length === 0;
  studentTeam.disabled = state.teams.length === 0;
  overviewTeam.disabled = state.teams.length === 0;
  paymentTeam.disabled = state.teams.length === 0;
  paymentScope.disabled = state.students.length === 0;
  paymentDelivery.disabled = state.deliveries.length === 0;
  studentForm.querySelector("button[type='submit']").disabled = state.students.length === 0 || state.teams.length === 0;
  renderPaymentMembers();
}

function paymentTeamMembers() {
  return state.students.filter((student) => student.teamId === paymentTeam.value);
}

function renderPaymentMembers() {
  const members = paymentTeamMembers();
  paymentMembers.innerHTML = members.length
    ? members.map((student) => `<option value="${student.id}">${student.name}</option>`).join("")
    : '<option value="">Este equipo no tiene estudiantes</option>';
  paymentMembers.disabled = paymentScope.value !== "members" || members.length === 0;
}

function renderSummary() {
  const studentId = selectedStudentId();
  if (!studentId) {
    document.querySelector("#totalCoins").textContent = "0";
    document.querySelector("#progressPercent").textContent = "0%";
    document.querySelector("#suggestedGrade").textContent = "-";
    document.querySelector("#studentStatus").textContent = "Sin estudiante";
    return;
  }
  const coins = earnedCoins(studentId);
  const progress = progressFor(studentId);
  const grade = gradeFor(progress);

  document.querySelector("#totalCoins").textContent = coins;
  document.querySelector("#progressPercent").textContent = `${progress}%`;
  document.querySelector("#suggestedGrade").textContent = grade;
  document.querySelector("#studentStatus").textContent = statusFor(grade);
}

function renderTeams() {
  teamList.innerHTML = state.teams.length
    ? state.teams
        .map((team) => {
          const members = state.students.filter((student) => student.teamId === team.id).length;
          return `
        <article class="team-card" style="--team-color: ${team.color}">
          <div class="identity">
            <span class="swatch" aria-hidden="true"></span>
            <div>
              <input class="plain-input" data-team-name="${team.id}" value="${team.name}" aria-label="Nombre del equipo" />
              <span>${members} estudiante${members === 1 ? "" : "s"}</span>
            </div>
          </div>
          <label class="field color-field">
            <span>Color</span>
            <input data-team-color="${team.id}" type="color" value="${team.color}" />
          </label>
          <button class="danger" type="button" data-delete-team="${team.id}">Eliminar grupo</button>
        </article>
      `;
        })
        .join("")
    : `<article class="empty-state">
        <strong>No hay equipos creados</strong>
        <span>Creá el primer equipo para poder asignar estudiantes.</span>
      </article>`;
}

function renderStudents() {
  studentList.innerHTML = state.students.length
    ? state.students
        .map((student) => {
          const team = getTeam(student.teamId);
          return `
        <article class="student-card" style="--team-color: ${team.color}">
          <div class="identity">
            <span class="swatch" aria-hidden="true"></span>
            <div>
              <strong>${student.name}</strong>
              <span>${student.email} · ${team.name} · ${student.contractAcceptedAt ? "contrato aceptado" : "contrato pendiente"}</span>
            </div>
          </div>
          <div class="student-card-actions">
            <label class="field">
              <span>Equipo</span>
              <select data-student-team="${student.id}">
                <option value="">Sin equipo</option>
                ${state.teams
                  .map((item) => `<option value="${item.id}" ${item.id === student.teamId ? "selected" : ""}>${item.name}</option>`)
                  .join("")}
              </select>
            </label>
            <button type="button" data-reset-password="${student.email}">Enviar recuperación</button>
          </div>
        </article>
      `;
        })
        .join("")
    : `<article class="empty-state">
        <strong>No hay estudiantes registrados</strong>
        <span>Cuando un estudiante cree su cuenta, aparecerá acá para asignarlo a un equipo.</span>
      </article>`;
}

function renderTeamOverview() {
  if (!state.teams.length) {
    teamOverview.innerHTML = `<article class="empty-state">
      <strong>Sin equipos para mostrar</strong>
      <span>El seguimiento por equipo se activa cuando creás al menos un equipo.</span>
    </article>`;
    return;
  }

  const teamId = overviewTeam.value || state.teams[0]?.id;
  const team = getTeam(teamId);
  const members = state.students.filter((student) => student.teamId === teamId);

  teamOverview.innerHTML = members.length
    ? members
        .map((student) => {
          const coins = earnedCoins(student.id);
          const progress = progressFor(student.id);
          const grade = gradeFor(progress);
          const risk = riskFor(student.id);
          return `
            <article class="overview-card" style="--team-color: ${team.color}">
              <div>
                <strong>${student.name}</strong>
                <span>${coins} DataCoins · nota sugerida ${grade}</span>
              </div>
              <div>
                <div class="progress-track" aria-hidden="true">
                  <div class="progress-fill" style="--progress: ${progress}%"></div>
                </div>
                <div class="progress-caption">
                  <span>${progress}%</span>
                  <span>${completedDeliveries(student.id).length}/${state.deliveries.length} entregas</span>
                </div>
              </div>
              <span class="pill ${risk.tone}">${risk.label}</span>
            </article>
          `;
        })
        .join("")
    : `<article class="overview-card" style="--team-color: ${team.color}">
        <strong>Este equipo no tiene estudiantes asignados</strong>
        <span>Agregá estudiantes registrados o reasigná integrantes desde el panel.</span>
      </article>`;
}

function renderDeliveriesAdmin() {
  deliveriesAdmin.innerHTML = state.deliveries
    .map(
      (delivery) => `
        <article class="delivery-row" data-id="${delivery.id}">
          <div>
            <div class="delivery-title">${delivery.title}</div>
            <div class="delivery-meta">${delivery.details}</div>
          </div>
          <label class="field">
            <span>Fecha limite</span>
            <input data-field="date" type="date" value="${delivery.date}" />
          </label>
          <label class="field">
            <span>DataCoins</span>
            <input data-field="coins" type="number" min="0" step="1" value="${delivery.coins}" />
          </label>
          <label class="field">
            <span>Estado</span>
            <select data-field="status">
              ${["Programada", "Abierta", "Cerrada", "En revision", "Finalizada"]
                .map((status) => `<option ${status === delivery.status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
          </label>
        </article>
      `
    )
    .join("");
}

function paymentBadge(payment) {
  if (!payment) return '<span class="pill warn">Pendiente</span>';
  if (Number(payment.penalty) > 0) return `<span class="pill warn">${payment.penalty}% penalizacion</span>`;
  return '<span class="pill ok">Pago registrado</span>';
}

function renderContractDocument(student, team, contractAcceptedAt, requiresAcceptance) {
  studentContract.innerHTML = `
    <section class="contract-card" style="--team-color: ${team.color}">
      <div class="contract-heading">
        <div>
          <p class="eyebrow">Contrato de prestación académica</p>
          <h3>Contratación para desarrollo de base de datos</h3>
        </div>
        <span class="pill ${contractAcceptedAt ? "ok" : "warn"}">
          ${contractAcceptedAt ? "Aceptado" : "Pendiente"}
        </span>
      </div>
      <p>
        Por la presente, <strong>Santiago Hernández</strong>, docente de Base de Datos en UTU Canelones,
        contrata a <strong>${student.name}</strong>${team.id ? `, integrante de <strong>${team.name}</strong>` : ""},
        para participar en el desarrollo, documentación y defensa técnica de un proyecto de base de datos.
      </p>
      <p>
        La remuneración será abonada en <strong>DataCoins</strong> según las entregas del contrato.
        Los DataCoins acumulados serán canjeados por calificación de acuerdo con el progreso alcanzado,
        la calidad técnica, la consistencia de las evidencias y la defensa del trabajo realizado.
      </p>
      <p>
        Los incumplimientos, entregas incompletas, demoras, falta de justificación técnica o dudas sobre
        la autoría podrán generar penalizaciones. Dichas penalizaciones serán consideradas en sentido
        negativo al momento de convertir los DataCoins en calificación.
      </p>
      <div class="contract-terms">
        <span>Contratante: Santiago Hernández</span>
        <span>Contratado/a: ${student.name}</span>
        <span>Modalidad de pago: DataCoins por entrega</span>
        <span>Destino: calificación de Base de Datos</span>
      </div>
      ${
        requiresAcceptance
          ? `<button class="primary contract-accept" type="button" data-accept-contract="true">Aceptar contrato y continuar</button>`
          : ""
      }
    </section>
  `;
}

function renderStudentPanel() {
  const studentId = selectedStudentId();
  if (!studentId) {
    document.querySelector("#studentPanelTitle").textContent = "Sin estudiante seleccionado";
    studentDashboard.innerHTML = "";
    studentContract.innerHTML = "";
    studentDeliveries.innerHTML = "";
    return;
  }

  const student = state.students.find((item) => item.id === studentId) || {
    id: currentProfile.id,
    name: currentProfile.full_name,
    email: currentProfile.email,
    teamId: currentProfile.team_id,
  };
  const team = getTeam(student.teamId);
  const payments = state.payments[studentId] || {};
  const coinsTotal = earnedCoins(studentId);
  const progress = progressFor(studentId);
  const grade = gradeFor(progress);
  const completed = completedDeliveries(studentId);
  const upcoming = nextDelivery(studentId);
  const risk = riskFor(studentId);
  const contractAcceptedAt = student.contractAcceptedAt || currentProfile.contract_accepted_at || "";
  const requiresAcceptance = currentProfile?.role === "student" && student.id === currentProfile.id && !contractAcceptedAt;

  document.querySelector("#studentPanelTitle").textContent = `${student.name} - ${team.name}`;
  renderContractDocument(student, team, contractAcceptedAt, requiresAcceptance);
  if (requiresAcceptance) {
    studentDashboard.innerHTML = "";
    studentDeliveries.innerHTML = `
      <article class="empty-state">
        <strong>Aceptá el contrato para continuar</strong>
        <span>Después de aceptar vas a poder ver entregas, DataCoins, feedback y progreso.</span>
      </article>
    `;
    return;
  }
  studentDashboard.innerHTML = `
    <section class="student-hero" style="--team-color: ${team.color}">
      <h3>${student.name}</h3>
      <div class="contract-line">${team.name} · UTU Canelones · Prof. Santiago Hernández</div>
      <div class="coin-total">
        <strong>${coinsTotal}</strong>
        <span>DataCoins</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" style="--progress: ${progress}%"></div>
      </div>
      <div class="progress-caption">
        <span>${coinsTotal}/${maxCoins()} DataCoins</span>
        <span>${progress}%</span>
      </div>
      <div class="mini-stats">
        <div class="mini-stat">
          <span>Estado</span>
          <strong>${risk.label}</strong>
        </div>
        <div class="mini-stat">
          <span>Nota sugerida</span>
          <strong>${grade}</strong>
        </div>
        <div class="mini-stat">
          <span>Entregas</span>
          <strong>${completed.length}/${state.deliveries.length}</strong>
        </div>
      </div>
    </section>
    <section class="next-delivery" style="--team-color: ${team.color}">
      <p class="eyebrow">Próxima entrega</p>
      ${
        upcoming
          ? `
            <h3>${upcoming.title}</h3>
            <div class="date">${formatDate(upcoming.date)}</div>
            <div class="student-meta">${upcoming.coins} DataCoins posibles · ${upcoming.status}</div>
            <p>${upcoming.details}</p>
          `
          : `
            <h3>Contrato completo</h3>
            <div class="date">Sin entregas pendientes</div>
            <div class="student-meta">Todas las entregas tienen pago registrado.</div>
          `
      }
    </section>
  `;

  const completedHtml = completed
    .map((delivery) => {
      const payment = payments[delivery.id];
      const coins = payment ? Number(payment.coins) : 0;
      return `
        <article class="student-row" style="--team-color: ${team.color}">
          <header>
            <div>
              <strong>${delivery.title}</strong>
              <div class="student-meta">Fecha limite: ${formatDate(delivery.date)} · Maximo: ${delivery.coins} DataCoins · ${delivery.status}</div>
            </div>
            ${paymentBadge(payment)}
          </header>
          <div>Pago obtenido: <strong>${coins}</strong> DataCoins</div>
          ${payment?.feedback ? `<div class="feedback">${payment.feedback}</div>` : ""}
        </article>
      `;
    })
    .join("");

  studentDeliveries.innerHTML = `
    <div class="section-label">Entregas realizadas</div>
    ${
      completedHtml ||
      `<article class="student-row" style="--team-color: ${team.color}">
        <strong>Todavía no hay entregas registradas</strong>
        <div class="student-meta">Cuando el docente cargue un pago, aparecerá en este historial.</div>
      </article>`
    }
  `;
}

function renderPanels() {
  renderShell();
  renderOptions();
  if (!paymentCoins.value && state.deliveries[0]) paymentCoins.value = state.deliveries[0].coins;
  paymentForm.querySelector("button[type='submit']").disabled =
    state.students.length === 0 || state.teams.length === 0 || state.deliveries.length === 0;
  renderSummary();
  renderTeams();
  renderStudents();
  renderTeamOverview();
  renderDeliveriesAdmin();
  renderStudentPanel();
}

async function refresh() {
  await loadData();
  renderPanels();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Ingresando...");
  const { error } = await db.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPassword.value,
  });
  setMessage(error ? error.message : "");
});

signupBtn.addEventListener("click", async () => {
  const fullName = authName.value.trim();
  if (!fullName) {
    setMessage("Para crear una cuenta estudiante, ingresá el nombre completo.");
    return;
  }

  setMessage("Creando cuenta...");
  const { error } = await db.auth.signUp({
    email: authEmail.value.trim(),
    password: authPassword.value,
    options: { data: { full_name: fullName } },
  });
  setMessage(error ? error.message : "Cuenta creada. Si Supabase pide confirmar email, revisá el correo.");
});

logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
});

teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = teamName.value.trim();
  if (!name) return;

  await db.from("teams").insert({ name, color: teamColor.value });
  teamName.value = "";
  await refresh();
});

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!studentAccount.value || !studentTeam.value) return;

  await db.from("profiles").update({ team_id: studentTeam.value }).eq("id", studentAccount.value);
  await refresh();
});

studentList.addEventListener("change", async (event) => {
  const studentId = event.target.dataset.studentTeam;
  if (!studentId) return;

  await db.from("profiles").update({ team_id: event.target.value || null }).eq("id", studentId);
  await refresh();
});

studentList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reset-password]");
  const email = button?.dataset.resetPassword;
  if (!email) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Enviando...";
  button.title = "";

  let { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: APP_URL,
  });

  if (error && /redirect|url|site/i.test(error.message || "")) {
    ({ error } = await db.auth.resetPasswordForEmail(email));
  }

  if (error) {
    button.disabled = false;
    button.textContent = "No se pudo enviar";
    button.title = error.message || String(error);
    setTeacherMessage(shortError(error));
    setTimeout(() => {
      button.textContent = originalText;
    }, 4500);
    return;
  }

  button.textContent = "Recuperación enviada";
  setTeacherMessage(`Se envió un mail de recuperación a ${email}.`);
});

passwordResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordResetMessage.textContent = "";

  if (newPassword.value !== newPasswordConfirm.value) {
    passwordResetMessage.textContent = "Las contraseñas no coinciden.";
    return;
  }

  const { error } = await db.auth.updateUser({ password: newPassword.value });
  if (error) {
    passwordResetMessage.textContent = error.message;
    return;
  }

  passwordResetMessage.textContent = "Contraseña actualizada. Redirigiendo...";
  window.history.replaceState({}, document.title, window.location.pathname);
  await db.auth.signOut();
  window.location.href = APP_URL;
});

teamList.addEventListener("change", async (event) => {
  const colorTeamId = event.target.dataset.teamColor;
  const nameTeamId = event.target.dataset.teamName;
  const teamId = colorTeamId || nameTeamId;
  if (!teamId) return;

  const patch = {};
  if (colorTeamId) patch.color = event.target.value;
  if (nameTeamId && event.target.value.trim()) patch.name = event.target.value.trim();
  await db.from("teams").update(patch).eq("id", teamId);
  await refresh();
});

teamList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-team]");
  const teamId = button?.dataset.deleteTeam;
  if (!teamId) return;

  const team = state.teams.find((item) => item.id === teamId);
  const members = state.students.filter((student) => student.teamId === teamId).length;
  const memberText = members === 1 ? "1 estudiante quedará sin equipo" : `${members} estudiantes quedarán sin equipo`;
  const confirmed = window.confirm(`¿Eliminar el grupo "${team?.name || "seleccionado"}"? ${memberText}.`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Eliminando...";
  const { error } = await db.from("teams").delete().eq("id", teamId);
  if (error) {
    button.disabled = false;
    button.textContent = "Eliminar grupo";
    setTeacherMessage(error.message);
    return;
  }

  setTeacherMessage(`Grupo "${team?.name || "seleccionado"}" eliminado.`);
  await refresh();
});

deliveriesAdmin.addEventListener("change", async (event) => {
  const field = event.target.dataset.field;
  if (!field) return;

  const row = event.target.closest(".delivery-row");
  const patch = {};
  if (field === "date") patch.due_date = event.target.value;
  if (field === "coins") patch.max_coins = Number(event.target.value);
  if (field === "status") patch.status = event.target.value;
  await db.from("deliveries").update(patch).eq("id", row.dataset.id);
  await refresh();
});

paymentDelivery.addEventListener("change", () => {
  const delivery = state.deliveries.find((item) => item.id === paymentDelivery.value);
  paymentCoins.value = delivery?.coins || 0;
});

paymentTeam.addEventListener("change", renderPaymentMembers);
paymentScope.addEventListener("change", renderPaymentMembers);

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const members = paymentTeamMembers();
  const selectedIds =
    paymentScope.value === "team"
      ? members.map((student) => student.id)
      : Array.from(paymentMembers.selectedOptions).map((option) => option.value).filter(Boolean);

  if (!selectedIds.length || !paymentDelivery.value) return;

  await db.from("payments").upsert(
    selectedIds.map((studentId) => ({
      student_id: studentId,
      delivery_id: paymentDelivery.value,
      coins: Number(paymentCoins.value || 0),
      penalty: Number(paymentPenalty.value || 0),
      feedback: paymentFeedback.value.trim(),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "student_id,delivery_id" }
  );

  paymentFeedback.value = "";
  studentSelect.value = selectedIds[0];
  await refresh();
});

studentSelect.addEventListener("change", renderPanels);
overviewTeam.addEventListener("change", renderTeamOverview);

studentContract.addEventListener("click", async (event) => {
  if (!event.target.dataset.acceptContract) return;

  event.target.disabled = true;
  const { data, error } = await db.rpc("accept_contract");
  if (error) {
    event.target.disabled = false;
    event.target.textContent = "No se pudo aceptar";
    return;
  }

  currentProfile.contract_accepted_at = data || new Date().toISOString();
  await refresh();
});

resetBtn.addEventListener("click", async () => {
  await db.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await refresh();
});

async function boot() {
  if (!isConfigured) {
    setupPanel.hidden = false;
    authPanel.hidden = true;
    passwordResetPanel.hidden = true;
    appMain.hidden = true;
    logoutBtn.hidden = true;
    studentPickerWrap.hidden = true;
    return;
  }

  isRecoveringPassword = isPasswordRecoveryLink();
  if (isRecoveringPassword) {
    showPasswordResetPanel();
  }

  const { data } = await db.auth.getSession();
  session = data.session;

  db.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    if (isRecoveringPassword) {
      showPasswordResetPanel();
      return;
    }

    if (!session) {
      currentProfile = null;
      authPanel.hidden = false;
      passwordResetPanel.hidden = true;
      appMain.hidden = true;
      logoutBtn.hidden = true;
      studentPickerWrap.hidden = true;
      sessionBox.textContent = "";
      return;
    }

    try {
      await loadProfile();
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  });

  if (isRecoveringPassword) return;

  if (!session) {
    authPanel.hidden = false;
    passwordResetPanel.hidden = true;
    appMain.hidden = true;
    logoutBtn.hidden = true;
    studentPickerWrap.hidden = true;
    return;
  }

  await loadProfile();
  await refresh();
}

boot();
