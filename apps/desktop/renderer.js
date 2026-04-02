const list = document.getElementById('list');
const template = document.getElementById('itemTemplate');
const input = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const updateNotification = document.getElementById('update-notification');
const updateStatus = document.getElementById('update-status');
const updateRestartBtn = document.getElementById('update-restart-btn');

const items = new Map();

function renderItem(data) {
  let node = items.get(data.id);
  if (!node) {
    node = template.content.firstElementChild.cloneNode(true);
    list.prepend(node);
    items.set(data.id, node);

    node.querySelector('.send').addEventListener('click', async (event) => {
      const btn = event.currentTarget;
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

    node.querySelector('.retry').addEventListener('click', async () => {
      await window.localtube.retryDownload(data.id);
    });
  }

  node.querySelector('.title').textContent = data.title || 'Naujas įrašas';
  node.querySelector('.status').textContent = data.status || '';
  node.querySelector('.progress').textContent = typeof data.progress === 'number' ? `${data.progress}%` : '';
  node.querySelector('.error').textContent = data.error || '';

  const sendBtn = node.querySelector('.send');
  const retryBtn = node.querySelector('.retry');

  sendBtn.style.display = data.outputPath && !data.transfer ? 'inline-flex' : 'none';
  retryBtn.style.display = data.error ? 'inline-flex' : 'none';

  const qr = node.querySelector('.qr');
  const link = node.querySelector('.link');
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

window.localtube.onUpdate((data) => {
  renderItem(data);
});

window.localtube.onUpdateAvailable(() => {
  updateNotification.classList.remove('hidden');
  updateStatus.textContent = 'Yra nauja versija. Atsisiunčiama...';
});

window.localtube.onUpdateProgress((percent) => {
  updateStatus.textContent = `Atsisiunčiama nauja versija: ${Math.round(percent)}%`;
});

window.localtube.onUpdateDownloaded(() => {
  updateStatus.textContent = 'Nauja versija paruošta.';
  updateRestartBtn.classList.remove('hidden');
});

window.localtube.onCrash((err) => {
  alert(`Programa netikėtai sustojo:\n${err.message}\n\nPerkraukite programą.`);
});

updateRestartBtn.addEventListener('click', () => {
  window.localtube.restartForUpdate();
});

async function startDownload() {
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

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    startDownload();
  }
});

downloadBtn.addEventListener('click', () => {
  startDownload();
});
