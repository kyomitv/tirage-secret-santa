/**
 * Secret Admin dashboard logic
 */
(() => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const eventId = pathParts[1] || new URLSearchParams(window.location.search).get('id');

  const urlParams = new URLSearchParams(window.location.search);
  let adminToken = urlParams.get('token') || sessionStorage.getItem(`admin_token_${eventId}`) || '';

  // DOM Elements
  const tokenPromptPanel = document.getElementById('token-prompt-panel');
  const manualTokenInput = document.getElementById('manual-admin-token');
  const btnSubmitToken = document.getElementById('btn-submit-token');

  const mainPanel = document.getElementById('admin-main-panel');
  const eventTitle = document.getElementById('admin-event-title');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressCountLabel = document.getElementById('progress-count-label');

  const shareInput = document.getElementById('admin-share-link');
  const btnCopyPublic = document.getElementById('btn-copy-public-link');
  const btnOpenParticipant = document.getElementById('btn-open-participant-page');

  const btnToggleSecrets = document.getElementById('btn-toggle-secrets');
  const btnRefresh = document.getElementById('btn-refresh-admin');
  const tbody = document.getElementById('admin-participants-tbody');

  let showSecrets = false;
  let currentEvent = null;

  if (!adminToken) {
    tokenPromptPanel.style.display = 'block';
  } else {
    loadAdminData();
  }

  btnSubmitToken.addEventListener('click', () => {
    const val = manualTokenInput.value.trim();
    if (!val) return;
    adminToken = val;
    sessionStorage.setItem(`admin_token_${eventId}`, val);
    tokenPromptPanel.style.display = 'none';
    loadAdminData();
  });

  async function loadAdminData() {
    try {
      const res = await fetch(`/api/events/${eventId}/admin?token=${encodeURIComponent(adminToken)}`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          tokenPromptPanel.style.display = 'block';
          mainPanel.style.display = 'none';
          showToast('Clé administrateur invalide.');
          return;
        }
        throw new Error('Erreur lors du chargement des données.');
      }

      currentEvent = await res.json();
      tokenPromptPanel.style.display = 'none';
      mainPanel.style.display = 'block';
      renderDashboard(currentEvent);
    } catch (err) {
      showToast(err.message);
    }
  }

  function renderDashboard(event) {
    eventTitle.textContent = `${event.title} (Admin)`;

    // Public share link
    const origin = window.location.origin;
    const publicUrl = `${origin}/draw/${event.id}`;
    shareInput.value = publicUrl;
    btnOpenParticipant.href = publicUrl;

    // Progress
    const total = event.participants.length;
    const opened = event.participants.filter(p => p.isOpened).length;
    const pct = total > 0 ? Math.round((opened / total) * 100) : 0;

    progressPercent.textContent = `${pct}%`;
    progressBarFill.style.width = `${pct}%`;
    progressCountLabel.textContent = `${opened} / ${total} enveloppe${total > 1 ? 's' : ''} ouverte${opened > 1 ? 's' : ''}`;

    // Render table
    tbody.innerHTML = '';
    event.participants.forEach(p => {
      const tr = document.createElement('tr');

      const openedDateStr = p.openedAt 
        ? new Date(p.openedAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '-';

      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff;">${escapeHtml(p.name)}</td>
        <td>
          ${p.isOpened 
            ? '<span class="envelope-status" style="background: rgba(16, 185, 129, 0.15); color: var(--emerald-400); border: 1px solid rgba(16, 185, 129, 0.3);">🟢 Ouvert</span>' 
            : '<span class="envelope-status" style="background: rgba(245, 158, 11, 0.15); color: var(--gold-400); border: 1px solid rgba(245, 158, 11, 0.3);">⏳ En attente</span>'}
        </td>
        <td style="color: var(--text-secondary); font-size: 0.85rem;">${openedDateStr}</td>
        <td class="secret-col" style="${showSecrets ? '' : 'display: none;'}">
          <span class="secret-target-cell ${showSecrets ? 'revealed' : ''}">
            🎁 ${escapeHtml(p.targetName)}
          </span>
        </td>
        <td style="text-align: right;">
          ${p.isOpened ? `
            <button type="button" class="btn btn-secondary btn-sm btn-reset" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Permet au participant d'ouvrir à nouveau son enveloppe">
              🔄 Réinitialiser
            </button>
          ` : `
            <span style="color: var(--text-muted); font-size: 0.8rem;">Non ouverte</span>
          `}
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Update secret header column visibility
    document.querySelectorAll('.secret-col').forEach(el => {
      el.style.display = showSecrets ? '' : 'none';
    });
  }

  // Reset participant handler
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-reset');
    if (!btn) return;

    const partId = btn.dataset.id;
    const partName = btn.dataset.name;

    if (!confirm(`Voulez-vous vraiment réinitialiser l'enveloppe de ${partName} ? Elle pourra être rouverte.`)) {
      return;
    }

    try {
      btn.disabled = true;
      const res = await fetch(`/api/events/${eventId}/admin/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: partId, adminToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation');
      }

      showToast(`Enveloppe de ${partName} réinitialisée !`);
      loadAdminData();
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  });

  // Toggle secrets button
  btnToggleSecrets.addEventListener('click', () => {
    showSecrets = !showSecrets;
    btnToggleSecrets.textContent = showSecrets ? '🙈 Masquer les cibles' : '👁️ Afficher les cibles';
    document.querySelectorAll('.secret-col').forEach(el => {
      el.style.display = showSecrets ? '' : 'none';
    });
    document.querySelectorAll('.secret-target-cell').forEach(el => {
      if (showSecrets) el.classList.add('revealed');
      else el.classList.remove('revealed');
    });
  });

  // Reset all openings
  const btnResetAll = document.getElementById('btn-reset-all-openings');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', async () => {
      if (!confirm('Voulez-vous vraiment réinitialiser toutes les ouvertures ?\n\nChaque invité pourra rouvrir son enveloppe (le tirage reste identique).')) {
        return;
      }

      try {
        btnResetAll.disabled = true;
        const res = await fetch(`/api/events/${eventId}/admin/reset-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminToken })
        });

        const data = await res.json();
        btnResetAll.disabled = false;
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de la réinitialisation');
        }

        showToast('🔄 Toutes les enveloppes ont été remises à zéro !');
        loadAdminData();
      } catch (err) {
        btnResetAll.disabled = false;
        showToast(err.message);
      }
    });
  }

  // Reroll whole draw
  const btnRerollDraw = document.getElementById('btn-reroll-draw');
  if (btnRerollDraw) {
    btnRerollDraw.addEventListener('click', async () => {
      if (!confirm('⚠️ ATTENTION : Voulez-vous vraiment relancer un NOUVEAU tirage au sort ?\n\nDe nouvelles attributions secrètes seront créées pour tout le monde et toutes les enveloppes seront remises à zéro.')) {
        return;
      }

      try {
        btnRerollDraw.disabled = true;
        const res = await fetch(`/api/events/${eventId}/admin/reroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminToken })
        });

        const data = await res.json();
        btnRerollDraw.disabled = false;
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors du retirage');
        }

        showToast('🎲 Nouveau tirage effectué pour tous les participants !');
        loadAdminData();
      } catch (err) {
        btnRerollDraw.disabled = false;
        showToast(err.message);
      }
    });
  }

  btnRefresh.addEventListener('click', () => {
    loadAdminData();
    showToast('Données actualisées');
  });

  btnCopyPublic.addEventListener('click', () => {
    navigator.clipboard.writeText(shareInput.value);
    showToast('🔗 Lien public copié !');
  });

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Auto-refresh every 10 seconds
  setInterval(() => {
    if (adminToken && document.visibilityState === 'visible') {
      loadAdminData();
    }
  }, 10000);
})();
