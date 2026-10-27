/**
 * Participant draw page logic
 */
(() => {
  // Extract eventId from URL path (/draw/:id) or query (?id=...)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const eventId = pathParts[1] || new URLSearchParams(window.location.search).get('id');

  if (!eventId) {
    showError("Identifiant de tirage manquant dans l'adresse URL.");
    return;
  }

  // Local storage claim tokens helper
  const STORAGE_KEY = `santa_claims_${eventId}`;
  function getStoredClaims() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }
  function saveClaim(partId, token) {
    const claims = getStoredClaims();
    claims[partId] = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
  }

  // DOM Elements
  const loadingEl = document.getElementById('draw-loading');
  const errorEl = document.getElementById('draw-error');
  const errorMsgEl = document.getElementById('draw-error-msg');
  const titleEl = document.getElementById('draw-event-title');
  const infoBar = document.getElementById('event-info-bar');
  const pillBudget = document.getElementById('pill-budget');
  const valBudget = document.getElementById('val-budget');
  const pillRules = document.getElementById('pill-rules');
  const valRules = document.getElementById('val-rules');
  const gridEl = document.getElementById('participants-grid');

  // Confirmation Modal
  const confirmModal = document.getElementById('confirm-modal');
  const confirmNameTitle = document.getElementById('confirm-name-title');
  const confirmNameHighlight = document.getElementById('confirm-name-highlight');
  const btnCancelReveal = document.getElementById('btn-cancel-reveal');
  const btnConfirmReveal = document.getElementById('btn-confirm-reveal');

  // Reveal Modal
  const revealModal = document.getElementById('reveal-modal');
  const revealTitle = document.getElementById('reveal-modal-title');
  const revealDesc = document.getElementById('reveal-modal-desc');
  const targetRecipientName = document.getElementById('target-recipient-name');
  const btnCopyTarget = document.getElementById('btn-copy-target');
  const btnCloseReveal = document.getElementById('btn-close-reveal');

  // Locked Modal
  const lockedModal = document.getElementById('locked-modal');
  const lockedPersonName = document.getElementById('locked-person-name');
  const btnCloseLocked = document.getElementById('btn-close-locked');

  let selectedParticipant = null;
  let currentEvent = null;

  async function loadEvent() {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Impossible de charger ce tirage.');
      }

      currentEvent = await res.json();
      renderEvent(currentEvent);
    } catch (err) {
      showError(err.message);
    }
  }

  function renderEvent(event) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';

    document.title = `${event.title} 🎁 - Secret Santa`;
    titleEl.textContent = event.title;

    let hasInfo = false;
    if (event.budget) {
      valBudget.textContent = event.budget;
      pillBudget.style.display = 'inline-flex';
      hasInfo = true;
    }
    if (event.rules) {
      valRules.textContent = event.rules;
      pillRules.style.display = 'inline-flex';
      hasInfo = true;
    }
    if (hasInfo) {
      infoBar.style.display = 'flex';
    }

    renderParticipants(event.participants);
    gridEl.style.display = 'grid';
  }

  function renderParticipants(participants) {
    gridEl.innerHTML = '';
    const storedClaims = getStoredClaims();

    participants.forEach(p => {
      const isMine = Boolean(storedClaims[p.id]);
      const card = document.createElement('div');
      card.className = 'envelope-card';
      card.dataset.id = p.id;
      card.dataset.name = p.name;

      if (!p.isOpened) {
        if (storedClaims[p.id]) {
          delete storedClaims[p.id];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(storedClaims));
        }
        card.classList.add('ready');
        card.innerHTML = `
          <div class="envelope-icon">✉️</div>
          <div class="envelope-name">${escapeHtml(p.name)}</div>
          <div class="envelope-status">
            <span>✨ Cliquer pour ouvrir</span>
          </div>
        `;
        card.addEventListener('click', () => handleCardClick(p, false));
      } else if (isMine) {
        card.classList.add('mine');
        card.innerHTML = `
          <div class="envelope-icon">🌟</div>
          <div class="envelope-name">${escapeHtml(p.name)}</div>
          <div class="envelope-status">
            <span>🎁 Votre enveloppe (voir)</span>
          </div>
        `;
        card.addEventListener('click', () => handleReplayClick(p, storedClaims[p.id]));
      } else {
        card.classList.add('locked');
        card.innerHTML = `
          <div class="envelope-icon">🔒</div>
          <div class="envelope-name">${escapeHtml(p.name)}</div>
          <div class="envelope-status">
            <span>Scellée & Déjà ouverte</span>
          </div>
        `;
        card.addEventListener('click', () => handleLockedClick(p));
      }

      gridEl.appendChild(card);
    });
  }

  function handleCardClick(participant, isMine) {
    selectedParticipant = participant;
    confirmNameTitle.textContent = `Êtes-vous bien ${participant.name} ?`;
    confirmNameHighlight.textContent = participant.name;
    confirmModal.classList.add('active');
  }

  function handleLockedClick(participant) {
    lockedPersonName.textContent = participant.name;
    lockedModal.classList.add('active');
  }

  async function handleReplayClick(participant, claimToken) {
    try {
      const res = await fetch(`/api/events/${eventId}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participant.id, claimToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la lecture');
      }

      showRevealResult(participant.name, data.targetName, true);
    } catch (err) {
      showToast(err.message);
    }
  }

  // Confirm Reveal Action
  btnConfirmReveal.addEventListener('click', async () => {
    if (!selectedParticipant) return;
    confirmModal.classList.remove('active');

    const partId = selectedParticipant.id;
    const partName = selectedParticipant.name;

    try {
      btnConfirmReveal.disabled = true;

      const res = await fetch(`/api/events/${eventId}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: partId })
      });

      const data = await res.json();
      btnConfirmReveal.disabled = false;

      if (!res.ok) {
        throw new Error(data.error || "Impossible d'ouvrir l'enveloppe.");
      }

      // Store claim token in localStorage for this device
      saveClaim(partId, data.claimToken);

      // Trigger Confetti!
      if (window.confetti) {
        window.confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.55 }
        });
      }

      showRevealResult(partName, data.targetName, false);
      // Reload event cards in background to update statuses
      loadEvent();
    } catch (err) {
      btnConfirmReveal.disabled = false;
      showToast(err.message);
      loadEvent();
    }
  });

  btnCancelReveal.addEventListener('click', () => {
    confirmModal.classList.remove('active');
    selectedParticipant = null;
  });

  function showRevealResult(giverName, receiverName, isReplay) {
    if (isReplay) {
      revealTitle.textContent = `Bonjour ${giverName} !`;
      revealDesc.textContent = `Rappel de votre tirage secret :`;
    } else {
      revealTitle.textContent = `Félicitations ${giverName} ! 🎉`;
      revealDesc.textContent = `Voici votre attribution secrète :`;
    }

    targetRecipientName.textContent = receiverName;
    revealModal.classList.add('active');

    btnCopyTarget.onclick = () => {
      navigator.clipboard.writeText(receiverName);
      showToast(`🎁 Prénom "${receiverName}" copié !`);
    };
  }

  btnCloseReveal.addEventListener('click', () => {
    revealModal.classList.remove('active');
  });

  btnCloseLocked.addEventListener('click', () => {
    lockedModal.classList.remove('active');
  });

  function showError(msg) {
    loadingEl.style.display = 'none';
    gridEl.style.display = 'none';
    errorMsgEl.textContent = msg;
    errorEl.style.display = 'block';
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
    }, 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Periodic polling & focus refresh
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadEvent();
    }
  }, 12000);

  window.addEventListener('focus', () => {
    loadEvent();
  });

  // Initial load
  loadEvent();
})();
