export {};

interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: number;
}

interface TransferInfo {
  url: string;
  qr: string;
  expiresAt: number;
}

interface DownloadUpdate {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  error: string | null;
  outputPath: string | null;
  transfer: TransferInfo | null;
}

interface LocaltubeAPI {
  startDownload: (url: string) => Promise<{ id: string; error?: string }>;
  retryDownload: (id: string) => Promise<{ id: string }>;
  startTransfer: (id: string) => Promise<{ id?: string; error?: string; transfer?: TransferInfo }>;
  stopTransfer: (id: string) => Promise<void>;
  restartForUpdate: () => Promise<void>;
  discoverDevices: () => Promise<unknown>;
  getVersion: () => Promise<string>;
  getFiles: () => Promise<FileInfo[]>;
  deleteFile: (filePath: string) => Promise<boolean>;
  startTransferByPath: (filePath: string) => Promise<{ id?: string; error?: string; transfer?: TransferInfo }>;
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, err?: unknown) => void;
  onUpdate: (callback: (data: DownloadUpdate) => void) => void;
  onUpdateAvailable: (callback: () => void) => void;
  onUpdateProgress: (callback: (percent: number) => void) => void;
  onUpdateDownloaded: (callback: () => void) => void;
  onCrash: (callback: (err: { message: string }) => void) => void;
}

declare global {
  interface Window {
    localtube: LocaltubeAPI;
  }
}

const list = document.getElementById('list') as HTMLElement;
const template = document.getElementById('itemTemplate') as HTMLTemplateElement;
const input = document.getElementById('urlInput') as HTMLInputElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const updateNotification = document.getElementById('update-notification') as HTMLElement;
const updateStatus = document.getElementById('update-status') as HTMLElement;
const updateRestartBtn = document.getElementById('update-restart-btn') as HTMLButtonElement;
const versionDisplay = document.getElementById('version-display') as HTMLElement;

const storageTitle = document.getElementById('storageTitle') as HTMLElement;
const storageStats = document.getElementById('storageStats') as HTMLElement;
const storageList = document.getElementById('storageList') as HTMLElement;
const storageItemTemplate = document.getElementById('storageItemTemplate') as HTMLTemplateElement;

const items = new Map<string, HTMLElement>();
const storageItems = new Map<string, HTMLElement>();
const storageTransfers = new Map<string, TransferInfo | null>();
const storageServers = new Map<string, any>();

const deletionsInProgress = new Set<string>();

const STORAGE_STRINGS = {
  title: 'Mano vaizdo įrašai',
  empty: 'Dar nėra atsisiųstų vaizdo įrašų',
  delete: 'Ištrinti',
  confirmDelete: 'Ar tikrai norite ištrinti šį failą?',
  size: 'Dydis',
  totalSize: 'Viso užimama vieta'
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function loadStorage(): Promise<void> {
  const files = await window.localtube.getFiles();
  
  if (storageTitle) {
    storageTitle.textContent = STORAGE_STRINGS.title;
  }

  if (files.length === 0) {
    storageStats.textContent = STORAGE_STRINGS.empty;
    storageList.innerHTML = '';
    storageItems.clear();
    return;
  }

  const totalBytes = files.reduce((acc: number, file: FileInfo) => acc + file.size, 0);
  storageStats.textContent = `${STORAGE_STRINGS.totalSize}: ${formatSize(totalBytes)}`;

  const currentPaths = new Set(files.map((f: FileInfo) => f.path));

  for (const path of Array.from(storageItems.keys())) {
    if (!currentPaths.has(path)) {
      const node = storageItems.get(path);
      node?.nextElementSibling?.remove(); 
      node?.remove();
      storageItems.delete(path);
    }
  }

  files.forEach((file: FileInfo) => {
    let node = storageItems.get(file.path);
    if (!node) {
      node = storageItemTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement;
      const qrContainer = storageItemTemplate.content.lastElementChild?.cloneNode(true) as HTMLElement;
      qrContainer.setAttribute('data-path', file.path);
      
      storageList.appendChild(node);
      storageList.appendChild(qrContainer);
      storageItems.set(file.path, node);

      const deleteBtn = node.querySelector('.delete-btn') as HTMLButtonElement;
      deleteBtn.textContent = STORAGE_STRINGS.delete;
      deleteBtn.addEventListener('click', async () => {
        if (deletionsInProgress.has(file.path)) return;
        
        if (window.confirm(STORAGE_STRINGS.confirmDelete)) {
          deletionsInProgress.add(file.path);
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Trinama...';
          
          try {
            const success = await window.localtube.deleteFile(file.path);
            if (success) {
              await loadStorage();
            } else {
              alert('Nepavyko ištrinti failo.');
            }
          } finally {
            deletionsInProgress.delete(file.path);
            const currentNode = storageItems.get(file.path);
            if (currentNode) {
               const currentBtn = currentNode.querySelector('.delete-btn') as HTMLButtonElement;
               currentBtn.disabled = false;
               currentBtn.textContent = STORAGE_STRINGS.delete;
            }
          }
        }
      });

      const qrBtn = node.querySelector('.qr-btn') as HTMLButtonElement;
      qrBtn.addEventListener('click', async () => {
        window.localtube.log('info', `QR button clicked for file: ${file.path}`);
        const currentTransfer = storageTransfers.get(file.path);
        if (currentTransfer) {
          window.localtube.log('info', `Closing existing transfer for: ${file.path}`);
          storageTransfers.set(file.path, null);
          const serverId = storageServers.get(file.path);
          if (serverId) {
            await window.localtube.stopTransfer(serverId);
            storageServers.delete(file.path);
          }
          await loadStorage();
          return;
        }

        qrBtn.disabled = true;
        qrBtn.textContent = 'Kraunama...';
        try {
          window.localtube.log('info', `Starting transfer by path: ${file.path}`);
          const result = await window.localtube.startTransferByPath(file.path);
          if (result.transfer) {
            window.localtube.log('info', `Transfer started successfully for: ${file.path}`);
            storageTransfers.set(file.path, result.transfer);
            if (result.id) {
              storageServers.set(file.path, result.id);
            }
            await loadStorage();
          } else if (result.error) {
            window.localtube.log('error', `Transfer failed for: ${file.path}`, result.error);
            alert(result.error);
          }
        } catch (err: unknown) {
          window.localtube.log('error', `Exception in QR button handler for: ${file.path}`, err);
          alert('Įvyko klaida bandant sukurti QR kodą.');
        } finally {
          qrBtn.disabled = false;
          qrBtn.textContent = 'QR Kodas';
        }
      });
    }

    const nameEl = node.querySelector('.storage-item-name');
    if (nameEl) nameEl.textContent = file.name;
    const detailsEl = node.querySelector('.storage-item-details');
    if (detailsEl) detailsEl.textContent = `${STORAGE_STRINGS.size}: ${formatSize(file.size)}`;
    
    const deleteBtn = node.querySelector('.delete-btn') as HTMLButtonElement;
    if (deletionsInProgress.has(file.path)) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Trinama...';
    } else {
      deleteBtn.disabled = false;
      deleteBtn.textContent = STORAGE_STRINGS.delete;
    }

    const qrBtn = node.querySelector('.qr-btn') as HTMLButtonElement;
    const qrContainer = node.parentElement?.querySelector(`.storage-qr[data-path="${file.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`) as HTMLElement;
    const transfer = storageTransfers.get(file.path);

    if (transfer && transfer.qr) {
      qrBtn.textContent = 'Uždaryti QR';
      qrContainer.classList.remove('hidden');
      qrContainer.innerHTML = '';
      
      const img = document.createElement('img');
      img.src = transfer.qr;
      const caption = document.createElement('div');
      caption.textContent = 'Nuskenuokite kodą telefone.';
      const hint = document.createElement('div');
      hint.textContent = 'Telefonas ir kompiuteris turi būti prie to paties namų interneto.';
      
      const iosInstructions = document.createElement('div');
      iosInstructions.className = 'ios-instructions';
      iosInstructions.innerHTML = `
        <strong>iPhone naudotojams:</strong><br>
        1. Atidarykite nuorodą Safari naršyklėje.<br>
        2. Paspauskite "Share" (dalintis) mygtuką.<br>
        3. Pasirinkite "Save to Files" arba tiesiogiai "Save Video".
      `;

      qrContainer.appendChild(img);
      qrContainer.appendChild(caption);
      qrContainer.appendChild(hint);
      qrContainer.appendChild(iosInstructions);
      
      if (transfer.url) {
        const link = document.createElement('div');
        link.className = 'link';
        link.textContent = `Nuoroda: ${transfer.url}`;
        qrContainer.appendChild(link);
      }
    } else {
      qrBtn.textContent = 'QR Kodas';
      qrContainer.classList.add('hidden');
      qrContainer.innerHTML = '';
    }
  });
}

async function init(): Promise<void> {
  const version = await window.localtube.getVersion();
  if (versionDisplay) {
    versionDisplay.textContent = `v${version}`;
  }
  await loadStorage();
}

init();

function renderItem(data: Partial<DownloadUpdate> & { id: string }): void {
  let node = items.get(data.id);
  if (!node) {
    node = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
    list.prepend(node);
    items.set(data.id, node);

    const sendBtn = node.querySelector('.send') as HTMLButtonElement;
    sendBtn.addEventListener('click', async (event) => {
      const btn = event.currentTarget as HTMLButtonElement;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Jungiamasi...';
      try {
        const result = await window.localtube.startTransfer(data.id);
        if (result && result.error) {
          data.error = result.error;
          renderItem(data);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    const retryBtn = node.querySelector('.retry') as HTMLButtonElement;
    retryBtn.addEventListener('click', async () => {
      await window.localtube.retryDownload(data.id);
    });
  }

  const titleEl = node.querySelector('.title');
  if (titleEl) titleEl.textContent = data.title || 'Naujas įrašas';
  const statusEl = node.querySelector('.status');
  if (statusEl) statusEl.textContent = data.status || '';
  const progressEl = node.querySelector('.progress');
  if (progressEl) progressEl.textContent = typeof data.progress === 'number' ? `${data.progress}%` : '';
  const errorEl = node.querySelector('.error');
  if (errorEl) errorEl.textContent = data.error || '';

  const sendBtn = node.querySelector('.send') as HTMLElement;
  const retryBtn = node.querySelector('.retry') as HTMLElement;

  sendBtn.style.display = data.outputPath && !data.transfer ? 'inline-flex' : 'none';
  retryBtn.style.display = data.error ? 'inline-flex' : 'none';

  const qr = node.querySelector('.qr') as HTMLElement;
  const link = node.querySelector('.link') as HTMLElement;
  qr.innerHTML = '';
  link.textContent = '';
  if (data.transfer && data.transfer.qr) {
    const img = document.createElement('img');
    img.src = data.transfer.qr;
    const caption = document.createElement('div');
    caption.textContent = 'Nuskenuokite kodą telefone.';
    const hint = document.createElement('div');
    hint.textContent = 'Telefonas ir kompiuteris turi būti prie to paties namų interneto.';
    qr.appendChild(img);
    qr.appendChild(caption);
    qr.appendChild(hint);
    link.textContent = data.transfer.url ? `Nuoroda: ${data.transfer.url}` : '';
  }
}

window.localtube.onUpdate(async (data: DownloadUpdate) => {
  renderItem(data);
  if (data.status === 'Paruošta' || data.status === 'Paruošta siuntimui') {
    await loadStorage();
  }
});

window.localtube.onUpdateAvailable(() => {
  updateNotification.classList.remove('hidden');
  updateStatus.textContent = 'Yra nauja versija. Atsisiunčiama...';
});

window.localtube.onUpdateProgress((percent: number) => {
  updateStatus.textContent = `Atsisiunčiama nauja versija: ${Math.round(percent)}%`;
});

window.localtube.onUpdateDownloaded(() => {
  updateStatus.textContent = 'Nauja versija paruošta.';
  updateRestartBtn.classList.remove('hidden');
});

window.localtube.onCrash((err: { message: string }) => {
  alert(`Programa netikėtai sustojo:\n${err.message}\n\nPerkraukite programą.`);
});

updateRestartBtn.addEventListener('click', () => {
  window.localtube.restartForUpdate();
});

async function startDownload(): Promise<void> {
  const url = input.value.trim();
  if (!url) return;
  const result = await window.localtube.startDownload(url);
  if (result.error) {
    const errorItem = {
      id: result.id,
      title: url,
      status: '',
      progress: 0,
      error: result.error,
      outputPath: null
    };
    renderItem(errorItem);
  }
}

input.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    startDownload();
  }
});

downloadBtn.addEventListener('click', () => {
  startDownload();
});
