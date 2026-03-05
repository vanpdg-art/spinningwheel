const state = {
  male: [],
  female: [],
};

const elements = {
  maleTbody: document.querySelector("#male-table tbody"),
  femaleTbody: document.querySelector("#female-table tbody"),
  addMaleBtn: document.getElementById("add-male"),
  addFemaleBtn: document.getElementById("add-female"),
  copyJsonBtn: document.getElementById("copy-json"),
  downloadJsonBtn: document.getElementById("download-json"),
  jsonPreview: document.getElementById("json-preview"),
  status: document.getElementById("status"),
};

function toOptionalNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeEntry(entry) {
  return {
    name: String(entry?.name ?? ""),
    priority: toOptionalNumber(entry?.priority),
    exclusiveID: toOptionalNumber(entry?.exclusiveID),
  };
}

function compactEntry(entry) {
  const compacted = { name: entry.name.trim() };

  if (typeof entry.priority === "number") {
    compacted.priority = entry.priority;
  }

  if (typeof entry.exclusiveID === "number") {
    compacted.exclusiveID = entry.exclusiveID;
  }

  return compacted;
}

function snapshot() {
  return {
    male: state.male.map(compactEntry),
    female: state.female.map(compactEntry),
  };
}

function renderJsonPreview() {
  elements.jsonPreview.value = JSON.stringify(snapshot(), null, 2);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function bindInput(input, onChange) {
  input.addEventListener("input", (event) => {
    onChange(event.target.value);
    renderJsonPreview();
  });
}

function createCellInput(type, value) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  return input;
}

function createRow(group, row, index) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  const priorityTd = document.createElement("td");
  const exclusiveTd = document.createElement("td");
  const actionTd = document.createElement("td");

  const nameInput = createCellInput("text", row.name);
  const priorityInput = createCellInput("number", row.priority);
  const exclusiveInput = createCellInput("number", row.exclusiveID);

  bindInput(nameInput, (value) => {
    state[group][index].name = value;
  });

  bindInput(priorityInput, (value) => {
    state[group][index].priority = toOptionalNumber(value);
  });

  bindInput(exclusiveInput, (value) => {
    state[group][index].exclusiveID = toOptionalNumber(value);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.className = "remove-btn";
  removeBtn.addEventListener("click", () => {
    state[group].splice(index, 1);
    renderTable(group);
    renderJsonPreview();
  });

  nameTd.append(nameInput);
  priorityTd.append(priorityInput);
  exclusiveTd.append(exclusiveInput);
  actionTd.append(removeBtn);

  tr.append(nameTd, priorityTd, exclusiveTd, actionTd);
  return tr;
}

function renderTable(group) {
  const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
  tbody.innerHTML = "";

  state[group].forEach((row, index) => {
    tbody.append(createRow(group, row, index));
  });
}

function addRow(group) {
  state[group].push({ name: "", priority: undefined, exclusiveID: undefined });
  renderTable(group);
  renderJsonPreview();
}

async function copyJsonToClipboard() {
  try {
    await navigator.clipboard.writeText(elements.jsonPreview.value);
    setStatus("JSON copied to clipboard.");
  } catch {
    setStatus("Could not copy automatically. Please copy from the Preview JSON box.");
  }
}

function downloadJson() {
  const blob = new Blob([elements.jsonPreview.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "students.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Downloaded students.json.");
}

async function init() {
  try {
    const response = await fetch("../data/students.json");
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const data = await response.json();
    state.male = (data.male ?? []).map(normalizeEntry);
    state.female = (data.female ?? []).map(normalizeEntry);

    renderTable("male");
    renderTable("female");
    renderJsonPreview();
    setStatus("Loaded data/students.json. Edit the table then copy/download the output.");
  } catch (error) {
    setStatus(error.message);
  }
}

elements.addMaleBtn.addEventListener("click", () => addRow("male"));
elements.addFemaleBtn.addEventListener("click", () => addRow("female"));
elements.copyJsonBtn.addEventListener("click", copyJsonToClipboard);
elements.downloadJsonBtn.addEventListener("click", downloadJson);

init();
