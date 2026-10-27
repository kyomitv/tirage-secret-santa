/**
 * Creator page logic
 */
(() => {
  const participants = new Set(['Alice', 'Bob', 'Charlie', 'David']);
  const exclusions = []; // Array of { giver: string, receiver: string }

  // DOM elements
  const form = document.getElementById('create-draw-form');
  const countEl = document.getElementById('participant-count');
  const tagsContainer = document.getElementById('participant-tags-container');
  const nameInput = document.getElementById('participant-name-input');
  const btnAdd = document.getElementById('btn-add-participant');

  const btnToggleBulk = document.getElementById('btn-toggle-bulk');
  const singleInputMode = document.getElementById('single-input-mode');
  const bulkInputMode = document.getElementById('bulk-input-mode');
  const bulkTextarea = document.getElementById('bulk-names-textarea');
  const btnConfirmBulk = document.getElementById('btn-confirm-bulk');
  const btnCancelBulk = document.getElementById('btn-cancel-bulk');

  const toggleExclusionsBtn = document.getElementById('toggle-exclusions-btn');
  const exclusionsBox = document.getElementById('exclusions-box');
  const exclusionsList = document.getElementById('exclusions-list');
  const btnAddExclusion = document.getElementById('btn-add-exclusion');

  const formError = document.getElementById('form-error');
  const successModal = document.getElementById('success-modal');
  const shareLinkInput = document.getElementById('share-link-input');
  const adminLinkInput = document.getElementById('admin-link-input');
  const btnCopyShare = document.getElementById('btn-copy-share');
  const btnCopyAdmin = document.getElementById('btn-copy-admin');
  const btnWhatsapp = document.getElementById('btn-whatsapp-share');
  const btnOpenDraw = document.getElementById('btn-open-draw');
  const btnOpenAdmin = document.getElementById('btn-open-admin');

  function renderTags() {
    tagsContainer.innerHTML = '';
    const list = Array.from(participants);
    countEl.textContent = list.length;

    if (list.length === 0) {
      tagsContainer.innerHTML = '<span class="empty-tags-hint">Ajoutez au moins 2 participants pour lancer le tirage.</span>';
      renderExclusions();
      return;
    }

    list.forEach(name => {
      const tag = document.createElement('span');
      tag.className = 'participant-tag';
      tag.innerHTML = `
        <span>${escapeHtml(name)}</span>
        <button type="button" class="tag-remove" title="Supprimer ${escapeHtml(name)}" data-name="${escapeHtml(name)}">&times;</button>
      `;
      tagsContainer.appendChild(tag);
    });

    renderExclusions();
  }

  function addParticipant(rawName) {
    const name = rawName.trim();
    if (!name) return;
    if (participants.has(name)) {
      showToast(`"${name}" est déjà dans la liste !`);
      return;
    }
    participants.add(name);
    nameInput.value = '';
    renderTags();
  }

  // Tag removal
  tagsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-remove');
    if (!btn) return;
    const name = btn.dataset.name;
    participants.delete(name);
    // Clean up exclusions for removed name
    for (let i = exclusions.length - 1; i >= 0; i--) {
      if (exclusions[i].giver === name || exclusions[i].receiver === name) {
        exclusions.splice(i, 1);
      }
    }
    renderTags();
  });

  // Single add handlers
  btnAdd.addEventListener('click', () => {
    addParticipant(nameInput.value);
    nameInput.focus();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParticipant(nameInput.value);
    }
  });

  // Bulk input handlers
  btnToggleBulk.addEventListener('click', () => {
    singleInputMode.style.display = 'none';
    bulkInputMode.style.display = 'block';
    bulkTextarea.focus();
  });

  btnCancelBulk.addEventListener('click', () => {
    bulkInputMode.style.display = 'none';
    singleInputMode.style.display = 'flex';
  });

  btnConfirmBulk.addEventListener('click', () => {
    const raw = bulkTextarea.value;
    const names = raw.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean);
    names.forEach(n => participants.add(n));
    bulkTextarea.value = '';
    bulkInputMode.style.display = 'none';
    singleInputMode.style.display = 'flex';
    renderTags();
  });

  // Exclusions management
  toggleExclusionsBtn.addEventListener('click', () => {
    exclusionsBox.classList.toggle('open');
  });

  function renderExclusions() {
    exclusionsList.innerHTML = '';
    const names = Array.from(participants);

    if (exclusions.length === 0) {
      exclusionsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.825rem; font-style: italic;">Aucune exclusion définie.</p>';
      return;
    }

    exclusions.forEach((rule, idx) => {
      const row = document.createElement('div');
      row.className = 'exclusion-item';

      const giverSelect = document.createElement('select');
      giverSelect.className = 'exclusion-select';
      names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        if (n === rule.giver) opt.selected = true;
        giverSelect.appendChild(opt);
      });
      giverSelect.addEventListener('change', (e) => {
        rule.giver = e.target.value;
      });

      const label = document.createElement('span');
      label.textContent = 'ne doit pas offrir à';
      label.style.fontSize = '0.85rem';
      label.style.color = 'var(--text-secondary)';

      const receiverSelect = document.createElement('select');
      receiverSelect.className = 'exclusion-select';
      names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        if (n === rule.receiver) opt.selected = true;
        receiverSelect.appendChild(opt);
      });
      receiverSelect.addEventListener('change', (e) => {
        rule.receiver = e.target.value;
      });

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'btn btn-secondary btn-sm';
      btnRemove.textContent = '✕';
      btnRemove.style.padding = '0.2rem 0.5rem';
      btnRemove.addEventListener('click', () => {
        exclusions.splice(idx, 1);
        renderExclusions();
      });

      row.appendChild(giverSelect);
      row.appendChild(label);
      row.appendChild(receiverSelect);
      row.appendChild(btnRemove);
      exclusionsList.appendChild(row);
    });
  }

  btnAddExclusion.addEventListener('click', () => {
    const names = Array.from(participants);
    if (names.length < 2) {
      showToast('Ajoutez d’abord au moins 2 participants.');
      return;
    }
    const giver = names[0];
    const receiver = names[1] || names[0];
    exclusions.push({ giver, receiver });
    renderExclusions();
  });

  // Submit draw
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.style.display = 'none';

    const list = Array.from(participants);
    if (list.length < 2) {
      formError.textContent = 'Veuillez ajouter au moins 2 participants.';
      formError.style.display = 'block';
      return;
    }

    // Map exclusions to { [giver]: [receiver] }
    const exclusionsMap = {};
    exclusions.forEach(({ giver, receiver }) => {
      if (giver && receiver && giver !== receiver) {
        if (!exclusionsMap[giver]) exclusionsMap[giver] = [];
        if (!exclusionsMap[giver].includes(receiver)) {
          exclusionsMap[giver].push(receiver);
        }
      }
    });

    const payload = {
      title: document.getElementById('event-title').value.trim(),
      budget: document.getElementById('event-budget').value.trim(),
      rules: document.getElementById('event-rules').value.trim(),
      participants: list,
      exclusions: exclusionsMap
    };

    try {
      const submitBtn = document.getElementById('btn-submit-draw');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Création du tirage en cours...';

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      submitBtn.disabled = false;
      submitBtn.textContent = '🎁 Lancer le tirage Secret Santa';

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création');
      }

      // Success
      const origin = window.location.origin;
      const shareUrl = `${origin}/draw/${data.eventId}`;
      const adminUrl = `${origin}/admin/${data.eventId}?token=${data.adminToken}`;

      shareLinkInput.value = shareUrl;
      adminLinkInput.value = adminUrl;

      btnOpenDraw.href = shareUrl;
      btnOpenAdmin.href = adminUrl;

      const waText = encodeURIComponent(
        `🎄 Le tirage Secret Santa "${payload.title || 'Secret Santa'}" est prêt ! ` +
        `Clique sur ce lien et sélectionne ton prénom pour voir à qui tu dois offrir ton cadeau (chacun ne peut ouvrir qu'une seule fois !) : ${shareUrl}`
      );
      btnWhatsapp.href = `https://api.whatsapp.com/send?text=${waText}`;

      successModal.classList.add('active');

      if (window.confetti) {
        window.confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      formError.textContent = err.message;
      formError.style.display = 'block';
    }
  });

  // Copy handlers
  btnCopyShare.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkInput.value);
    showToast('🔗 Lien participants copié dans le presse-papiers !');
  });

  btnCopyAdmin.addEventListener('click', () => {
    navigator.clipboard.writeText(adminLinkInput.value);
    showToast('🔐 Lien secret Administrateur copié !');
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Initial tag render
  renderTags();
})();
