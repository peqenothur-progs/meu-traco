const STORAGE_KEY = "meu-traco-notes-v1";

const canvas = document.querySelector("#writing-pad");
const context = canvas.getContext("2d");
const titleInput = document.querySelector("#note-name");
const transcriptionInput = document.querySelector("#transcription");
const hint = document.querySelector("#canvas-hint");
const statusMessage = document.querySelector("#status-message");
const suggestionPanel = document.querySelector("#suggestion-panel");
const suggestionList = document.querySelector("#suggestion-list");
const noteList = document.querySelector("#note-list");
const emptyState = document.querySelector("#empty-state");
const savedCount = document.querySelector("#saved-count");
const cameraPanel = document.querySelector("#camera-panel");
const cameraVideo = document.querySelector("#camera-video");
const sampleFile = document.querySelector("#sample-file");
const samplePreview = document.querySelector("#sample-preview");
const sampleImage = document.querySelector("#sample-image");
const sampleStatus = document.querySelector("#sample-status");
const typedForPaper = document.querySelector("#typed-for-paper");
const handwritingOutput = document.querySelector("#handwriting-output");
const installButton = document.querySelector("#install-app");
const installDialog = document.querySelector("#install-dialog");
const installInstructions = document.querySelector("#install-instructions");

let strokes = [];
let currentStroke = null;
let activeNoteId = null;
let notes = loadNotes();
let canvasWidth = 0;
let canvasHeight = 0;
let cameraStream = null;
let sampleImageUrl = null;
let deferredInstallPrompt = null;

const SAMPLE_DB_NAME = "meu-traco-samples";
const SAMPLE_STORE_NAME = "handwriting";

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isSecureAppOrigin =
  window.location.protocol === "https:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "[::1]";
if (isInstalled) {
  installButton.hidden = true;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  setStatus("Meu Traço foi instalado no aparelho.");
});

installButton.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice.outcome === "accepted") {
        setStatus("Instalação iniciada. O app ficará disponível na tela inicial.");
      }
    } catch (error) {
      console.error("Não foi possível iniciar a instalação.", error);
      deferredInstallPrompt = null;
      showInstallInstructions();
    }
    return;
  }

  showInstallInstructions();
});

function showInstallInstructions() {
  if (isIos) {
    installInstructions.textContent = "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois, confirme em “Adicionar”. Abra pelo novo ícone para usar como app.";
  } else if (isSecureAppOrigin && "serviceWorker" in navigator) {
    installInstructions.textContent = "No menu do navegador, escolha “Instalar app” ou “Adicionar à tela inicial”. Se essa opção não aparecer, abra o endereço no Chrome e tente novamente.";
  } else {
    installInstructions.textContent = "Para instalar no celular, o caderno precisa estar publicado em um endereço HTTPS. Depois, abra esse endereço no navegador do aparelho e escolha “Instalar app” ou “Adicionar à tela inicial”.";
  }
  installDialog.showModal();
}

document.querySelector("#close-install-dialog").addEventListener("click", () => {
  installDialog.close();
});

function loadNotes() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) {
      throw new Error("Formato de caderno inválido.");
    }
    return stored.filter((note) => note && typeof note.id === "string");
  } catch (error) {
    console.error("Não foi possível carregar as páginas guardadas.", error);
    setStatus("Não foi possível abrir as páginas guardadas neste aparelho.");
    return [];
  }
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function openSampleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SAMPLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SAMPLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSample(blob) {
  const database = await openSampleDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(SAMPLE_STORE_NAME, "readwrite");
    transaction.objectStore(SAMPLE_STORE_NAME).put(blob, "reference");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Salvamento cancelado."));
  });
  database.close();
  await showSample(blob);
}

async function loadSample() {
  const database = await openSampleDatabase();
  const blob = await new Promise((resolve, reject) => {
    const request = database.transaction(SAMPLE_STORE_NAME).objectStore(SAMPLE_STORE_NAME).get("reference");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (blob) {
    await showSample(blob);
  }
}

async function showSample(blob) {
  if (sampleImageUrl) {
    URL.revokeObjectURL(sampleImageUrl);
  }
  sampleImageUrl = URL.createObjectURL(blob);
  sampleImage.src = sampleImageUrl;
  samplePreview.hidden = false;
  sampleStatus.textContent = "Amostra guardada";
}

async function createSampleBlob(source, width, height) {
  const scale = Math.min(1, 1200 / Math.max(width, height));
  const output = document.createElement("canvas");
  output.width = Math.round(width * scale);
  output.height = Math.round(height * scale);
  output.getContext("2d").drawImage(source, 0, 0, output.width, output.height);
  return new Promise((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Não foi possível processar a foto."));
      }
    }, "image/jpeg", 0.82);
  });
}

function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) {
      track.stop();
    }
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
  cameraPanel.hidden = true;
}

document.querySelector("#open-camera").addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Câmera indisponível neste contexto. Use “Escolher ou fotografar” no celular.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    cameraVideo.srcObject = cameraStream;
    cameraPanel.hidden = false;
    await cameraVideo.play();
    setStatus("Câmera aberta. Enquadre sua escrita e tire a foto.");
  } catch (error) {
    console.error("Não foi possível abrir a câmera.", error);
    setStatus("Câmera não autorizada ou indisponível. Você também pode escolher uma foto.");
  }
});

document.querySelector("#close-camera").addEventListener("click", stopCamera);

document.querySelector("#capture-photo").addEventListener("click", async () => {
  try {
    const blob = await createSampleBlob(cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight);
    await storeSample(blob);
    stopCamera();
    setStatus("Foto guardada neste aparelho como referência do seu traço.");
  } catch (error) {
    console.error("Não foi possível guardar a foto.", error);
    setStatus("Não foi possível guardar a foto. Tente escolher outra imagem.");
  }
});

sampleFile.addEventListener("change", async () => {
  const file = sampleFile.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("Escolha um arquivo de imagem para a amostra.");
    sampleFile.value = "";
    return;
  }
  try {
    const image = await createImageBitmap(file);
    const blob = await createSampleBlob(image, image.width, image.height);
    image.close();
    await storeSample(blob);
    setStatus("Foto guardada neste aparelho como referência do seu traço.");
  } catch (error) {
    console.error("Não foi possível carregar a imagem de referência.", error);
    setStatus("Não foi possível abrir essa imagem. Tente outro arquivo.");
  } finally {
    sampleFile.value = "";
  }
});

document.querySelector("#delete-sample").addEventListener("click", async () => {
  try {
    const database = await openSampleDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SAMPLE_STORE_NAME, "readwrite");
      transaction.objectStore(SAMPLE_STORE_NAME).delete("reference");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Exclusão cancelada."));
    });
    database.close();
    samplePreview.hidden = true;
    sampleStatus.textContent = "Sem amostra";
    if (sampleImageUrl) {
      URL.revokeObjectURL(sampleImageUrl);
      sampleImageUrl = null;
    }
    sampleImage.removeAttribute("src");
    setStatus("Amostra apagada deste aparelho.");
  } catch (error) {
    console.error("Não foi possível apagar a amostra.", error);
    setStatus("Não foi possível apagar a amostra.");
  }
});

document.querySelector("#render-paper").addEventListener("click", () => {
  const text = typedForPaper.value;
  if (!text.trim()) {
    setStatus("Digite um texto antes de montar a página.");
    typedForPaper.focus();
    return;
  }
  handwritingOutput.textContent = text;
  handwritingOutput.classList.remove("is-placeholder");
  setStatus("Prévia pronta. Seu texto original foi mantido.");
});

document.querySelector("#print-paper").addEventListener("click", () => {
  if (handwritingOutput.classList.contains("is-placeholder")) {
    setStatus("Monte uma prévia antes de imprimir.");
    typedForPaper.focus();
    return;
  }
  window.print();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  redrawStrokes();
}

function redrawStrokes() {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#263d33";
  context.lineWidth = 2.5;

  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const point = stroke[0];
      context.beginPath();
      context.arc(point.x * canvasWidth, point.y * canvasHeight, 1.25, 0, Math.PI * 2);
      context.fillStyle = "#263d33";
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(stroke[0].x * canvasWidth, stroke[0].y * canvasHeight);
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    }
    context.stroke();
  }

  hint.classList.toggle("is-hidden", strokes.length > 0);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  currentStroke = [pointFromEvent(event)];
  strokes.push(currentStroke);
  redrawStrokes();
});

canvas.addEventListener("pointermove", (event) => {
  if (!currentStroke || !canvas.hasPointerCapture(event.pointerId)) {
    return;
  }
  currentStroke.push(pointFromEvent(event));
  redrawStrokes();
});

function finishStroke(event) {
  if (currentStroke && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  currentStroke = null;
}

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);
canvas.addEventListener("lostpointercapture", () => {
  currentStroke = null;
});

document.querySelector("#undo-stroke").addEventListener("click", () => {
  strokes.pop();
  redrawStrokes();
  setStatus("Último traço desfeito.");
});

document.querySelector("#clear-pad").addEventListener("click", () => {
  strokes = [];
  redrawStrokes();
  setStatus("Folha limpa. Suas palavras em texto continuam guardadas.");
});

document.querySelector("#new-note").addEventListener("click", () => {
  activeNoteId = null;
  titleInput.value = "";
  transcriptionInput.value = "";
  strokes = [];
  redrawStrokes();
  suggestionPanel.hidden = true;
  setStatus("Página nova pronta.");
  titleInput.focus();
});

document.querySelector("#organize-note").addEventListener("click", () => {
  const text = transcriptionInput.value.trim();
  if (!text) {
    setStatus("Digite ou cole uma transcrição antes de organizar as ideias.");
    transcriptionInput.focus();
    return;
  }

  const items = text
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  suggestionList.replaceChildren();
  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    suggestionList.append(listItem);
  }
  suggestionPanel.hidden = false;
  setStatus("Sugestão pronta. O texto original não foi alterado.");
});

document.querySelector("#save-note").addEventListener("click", () => {
  const title = titleInput.value.trim() || "Página sem título";
  const existingNote = notes.find((note) => note.id === activeNoteId);
  const note = {
    id: activeNoteId || crypto.randomUUID(),
    title,
    text: transcriptionInput.value,
    strokes,
    updatedAt: new Date().toISOString(),
    createdAt: existingNote ? existingNote.createdAt : new Date().toISOString(),
  };
  const nextNotes = [note, ...notes.filter((item) => item.id !== note.id)];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextNotes));
    notes = nextNotes;
    activeNoteId = note.id;
    renderNotes();
    setStatus("Página guardada neste aparelho.");
  } catch (error) {
    console.error("Não foi possível guardar a página.", error);
    setStatus("Não foi possível guardar. O armazenamento deste aparelho pode estar cheio.");
  }
});

function openNote(note) {
  activeNoteId = note.id;
  titleInput.value = note.title || "";
  transcriptionInput.value = note.text || "";
  strokes = Array.isArray(note.strokes) ? note.strokes : [];
  redrawStrokes();
  suggestionPanel.hidden = true;
  setStatus("Página aberta para continuar escrevendo.");
  document.querySelector("#note-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderNotes() {
  noteList.replaceChildren();
  emptyState.hidden = notes.length > 0;
  savedCount.textContent = `${notes.length} ${notes.length === 1 ? "página" : "páginas"}`;

  for (const note of notes) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "note-card";
    button.type = "button";
    button.setAttribute("aria-label", `Abrir página ${note.title || "sem título"}`);

    const preview = document.createElement("span");
    preview.className = "note-preview";
    if (Array.isArray(note.strokes) && note.strokes.length > 0) {
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = 84;
      previewCanvas.height = 92;
      drawPreview(previewCanvas, note.strokes);
      preview.append(previewCanvas);
    } else {
      preview.textContent = "✎";
    }

    const details = document.createElement("span");
    details.className = "note-details";
    const title = document.createElement("strong");
    title.textContent = note.title || "Página sem título";
    const date = document.createElement("span");
    date.textContent = new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(note.updatedAt));
    details.append(title, date);

    const arrow = document.createElement("span");
    arrow.className = "note-open";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.append(preview, details, arrow);
    button.addEventListener("click", () => openNote(note));
    item.append(button);
    noteList.append(item);
  }
}

function drawPreview(previewCanvas, noteStrokes) {
  const previewContext = previewCanvas.getContext("2d");
  previewContext.scale(previewCanvas.width, previewCanvas.height);
  previewContext.strokeStyle = "#52705c";
  previewContext.fillStyle = "#52705c";
  previewContext.lineWidth = 0.045;
  previewContext.lineCap = "round";
  previewContext.lineJoin = "round";
  for (const stroke of noteStrokes) {
    if (stroke.length === 1) {
      previewContext.beginPath();
      previewContext.arc(stroke[0].x, stroke[0].y, 0.025, 0, Math.PI * 2);
      previewContext.fill();
      continue;
    }
    previewContext.beginPath();
    previewContext.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) {
      previewContext.lineTo(point.x, point.y);
    }
    previewContext.stroke();
  }
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Não foi possível ativar o modo offline.", error);
      setStatus("O caderno abriu, mas o modo offline não pôde ser ativado.");
    });
  });
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pagehide", stopCamera);
resizeCanvas();
renderNotes();
loadSample().catch((error) => {
  console.error("Não foi possível carregar a amostra guardada.", error);
  setStatus("Não foi possível carregar a amostra deste aparelho.");
});
