/**
 * RoseAI - Intelligent Pink & White AI Assistant
 * Complete Interactive Application Logic
 */

(function () {
  'use strict';

  // ==========================================================================
  // App State & Storage Keys
  // ==========================================================================
  const STORAGE_KEYS = {
    CHATS: 'rose_ai_chats_v1',
    ACTIVE_CHAT_ID: 'rose_ai_active_chat_id_v1',
    SETTINGS: 'rose_ai_settings_v1',
    THEME_PALETTE: 'rose_ai_palette_v1'
  };

  const DEFAULT_SETTINGS = {
    model: 'claude-3-5-sonnet',
    systemPrompt: `You are RoseAI, an ultra-intelligent, friendly, and helpful AI assistant like ChatGPT and Claude. You provide clear, well-structured, accurate, and insightful responses with markdown formatting. You excel in English, Tamil, coding, science, creative writing, and any domain. Always format code blocks cleanly with appropriate language tags.`,
    apiProvider: 'auto',
    customApiKey: '',
    soundEnabled: true,
    palette: 'pink-sakura'
  };

  let state = {
    chats: [],
    activeChatId: null,
    settings: { ...DEFAULT_SETTINGS },
    isGenerating: false,
    abortController: null,
    isListening: false,
    recognition: null,
    currentlySpeakingUtterance: null
  };

  // Model Map for Puter AI
  const PUTER_MODEL_MAP = {
    'claude-3-5-sonnet': 'claude-3-5-sonnet',
    'gpt-4o': 'gpt-4o',
    'deepseek-chat': 'deepseek-chat',
    'gemini': 'gemini-1.5-pro'
  };

  // Ollama local backend URL
  const OLLAMA_API = 'http://localhost:11500';

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  const DOM = {
    appLayout: document.getElementById('appLayout'),
    sidebar: document.getElementById('sidebar'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistoryList: document.getElementById('chatHistoryList'),
    clearAllChatsBtn: document.getElementById('clearAllChatsBtn'),
    
    // Top Nav
    modelSelectorPill: document.getElementById('modelSelectorPill'),
    modelDropdownMenu: document.getElementById('modelDropdownMenu'),
    currentModelDisplay: document.getElementById('currentModelDisplay'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),

    // Chat Window
    messagesContainer: document.getElementById('messagesContainer'),
    welcomeHero: document.getElementById('welcomeHero'),
    messagesList: document.getElementById('messagesList'),
    typingIndicator: document.getElementById('typingIndicator'),
    messagesAnchor: document.getElementById('messagesAnchor'),
    stopGeneratingWrapper: document.getElementById('stopGeneratingWrapper'),
    stopGeneratingBtn: document.getElementById('stopGeneratingBtn'),

    // Input Bar
    chatInput: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),

    // Settings Modal
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    systemPromptInput: document.getElementById('systemPromptInput'),
    apiProviderSelect: document.getElementById('apiProviderSelect'),
    customApiKeyInput: document.getElementById('customApiKeyInput'),
    soundEffectsToggle: document.getElementById('soundEffectsToggle'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    paletteChips: document.querySelectorAll('.palette-chip'),

    // Toast
    toastNotification: document.getElementById('toastNotification'),
    toastMessage: document.getElementById('toastMessage')
  };

  // ==========================================================================
  // Audio Synthesizer (Chime Sound Effect using Web Audio API)
  // ==========================================================================
  function playChimeSound() {
    if (!state.settings.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pleasant high soft chime (C6 to G6)
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1567.98, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {
      // Audio might be blocked before first user interaction
    }
  }

  // ==========================================================================
  // Markdown Configuration
  // ==========================================================================
  if (window.marked) {
    const renderer = new marked.Renderer();
    
    // Custom code block renderer with copy button & language header
    renderer.code = function (code, infostring) {
      const lang = (infostring || '').match(/\S*/)[0] || 'text';
      let highlighted = '';
      if (window.hljs && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          highlighted = escapeHtml(code);
        }
      } else {
        highlighted = escapeHtml(code);
      }

      return `
        <div class="code-block-wrapper">
          <div class="code-header">
            <span>${lang}</span>
            <button class="copy-code-btn" onclick="copyCodeFromBlock(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
        </div>
      `;
    };

    marked.setOptions({
      renderer: renderer,
      gfm: true,
      breaks: true
    });
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // Window helper for inline onclick copy button
  window.copyCodeFromBlock = function (btn) {
    const pre = btn.closest('.code-block-wrapper').querySelector('pre code');
    if (!pre) return;
    navigator.clipboard.writeText(pre.innerText).then(() => {
      const span = btn.querySelector('span');
      const originalText = span.innerText;
      span.innerText = 'Copied! ✓';
      btn.style.background = 'var(--primary-pink)';
      btn.style.color = '#fff';
      setTimeout(() => {
        span.innerText = originalText;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
      showToast('Code copied to clipboard!');
    });
  };

  // ==========================================================================
  // Storage & State Management
  // ==========================================================================
  function loadFromStorage() {
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (storedSettings) {
        state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) };
      }

      const storedChats = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (storedChats) {
        state.chats = JSON.parse(storedChats);
      }

      const storedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
      if (storedActiveId && state.chats.some(c => c.id === storedActiveId)) {
        state.activeChatId = storedActiveId;
      } else if (state.chats.length > 0) {
        state.activeChatId = state.chats[0].id;
      } else {
        createNewChat(false);
      }
    } catch (e) {
      console.warn('Error reading localStorage:', e);
      createNewChat(false);
    }
  }

  function saveChats() {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(state.chats));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, state.activeChatId || '');
    } catch (e) {
      console.error('Error saving chats:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }

  // ==========================================================================
  // Chat Lifecycle
  // ==========================================================================
  function createNewChat(shouldRender = true) {
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      messages: []
    };

    state.chats.unshift(newChat);
    state.activeChatId = newChat.id;
    saveChats();

    if (shouldRender) {
      renderChatHistory();
      renderActiveChat();
      DOM.chatInput.focus();
    }
  }

  function getActiveChat() {
    return state.chats.find(c => c.id === state.activeChatId);
  }

  function deleteChat(chatId, e) {
    if (e) e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.activeChatId === chatId) {
      state.activeChatId = state.chats.length > 0 ? state.chats[0].id : null;
    }
    if (!state.activeChatId) {
      createNewChat(false);
    }
    saveChats();
    renderChatHistory();
    renderActiveChat();
    showToast('Conversation deleted');
  }

  function renameChat(chatId, e) {
    if (e) e.stopPropagation();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    const newName = prompt('Enter new conversation title:', chat.title);
    if (newName && newName.trim()) {
      chat.title = newName.trim();
      saveChats();
      renderChatHistory();
    }
  }

  function clearAllChats() {
    if (confirm('Are you sure you want to clear all conversations?')) {
      state.chats = [];
      state.activeChatId = null;
      createNewChat(true);
      showToast('All conversations cleared');
    }
  }

  // ==========================================================================
  // UI Rendering
  // ==========================================================================
  function renderChatHistory() {
    DOM.chatHistoryList.innerHTML = '';
    
    if (state.chats.length === 0) {
      DOM.chatHistoryList.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem 0.6rem;">No chats yet</div>
      `;
      return;
    }

    state.chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-history-item ${chat.id === state.activeChatId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="chat-item-text">${escapeHtml(chat.title)}</span>
        <div class="chat-item-actions">
          <button class="chat-action-btn rename-btn" title="Rename">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="chat-action-btn delete-btn" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener('click', () => {
        if (state.activeChatId !== chat.id) {
          state.activeChatId = chat.id;
          saveChats();
          renderChatHistory();
          renderActiveChat();
          // Mobile sidebar close
          if (window.innerWidth <= 768) {
            DOM.sidebar.classList.remove('mobile-open');
          }
        }
      });

      const renameBtn = item.querySelector('.rename-btn');
      renameBtn.addEventListener('click', (ev) => renameChat(chat.id, ev));

      const deleteBtn = item.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (ev) => deleteChat(chat.id, ev));

      DOM.chatHistoryList.appendChild(item);
    });
  }

  function renderActiveChat() {
    const chat = getActiveChat();
    DOM.messagesList.innerHTML = '';

    if (!chat || chat.messages.length === 0) {
      DOM.welcomeHero.classList.remove('hidden');
    } else {
      DOM.welcomeHero.classList.add('hidden');
      chat.messages.forEach((msg, idx) => {
        appendMessageElement(msg.role, msg.content, idx);
      });
    }

    scrollToBottom();
  }

  function appendMessageElement(role, content, index) {
    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user-row' : 'bot-row'}`;
    row.dataset.msgIndex = index;

    if (role === 'user') {
      row.innerHTML = `
        <div class="user-bubble">${escapeHtml(content)}</div>
      `;
    } else {
      let parsedHtml = '';
      if (window.marked) {
        parsedHtml = marked.parse(content);
      } else {
        parsedHtml = `<p>${escapeHtml(content)}</p>`;
      }

      row.innerHTML = `
        <div class="bot-msg-avatar">
          <div class="bot-avatar-inner">🌸</div>
        </div>
        <div class="bot-message-wrapper" style="width: 100%;">
          <div class="bot-bubble-card">
            ${parsedHtml}
          </div>
          <div class="bot-msg-actions">
            <button class="action-pill-btn copy-msg-btn" title="Copy response">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
            <button class="action-pill-btn speak-msg-btn" title="Read Aloud">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
              <span>Listen</span>
            </button>
            <button class="action-pill-btn regen-btn" title="Regenerate">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      `;

      // Copy Action
      const copyBtn = row.querySelector('.copy-msg-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          showToast('Message copied to clipboard!');
        });
      });

      // Speak Action
      const speakBtn = row.querySelector('.speak-msg-btn');
      speakBtn.addEventListener('click', () => {
        handleTextToSpeech(content, speakBtn);
      });

      // Regenerate Action
      const regenBtn = row.querySelector('.regen-btn');
      regenBtn.addEventListener('click', () => {
        handleRegenerate(index);
      });
    }

    DOM.messagesList.appendChild(row);
  }

  function scrollToBottom() {
    DOM.messagesAnchor.scrollIntoView({ behavior: 'smooth' });
  }

  // ==========================================================================
  // Text-To-Speech (SpeechSynthesis)
  // ==========================================================================
  function handleTextToSpeech(text, btnElement) {
    if (!('speechSynthesis' in window)) {
      showToast('Text-to-Speech is not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (state.currentlySpeakingUtterance) {
        state.currentlySpeakingUtterance = null;
        if (btnElement) btnElement.classList.remove('active');
        return;
      }
    }

    // Strip Markdown symbols for clean vocal speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#\[\]()]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    // Detect if Tamil text
    const isTamil = /[\u0B80-\u0BFF]/.test(cleanText);
    if (isTamil) {
      const voices = window.speechSynthesis.getVoices();
      const tamilVoice = voices.find(v => v.lang.includes('ta') || v.lang.includes('Tamil'));
      if (tamilVoice) utterance.voice = tamilVoice;
    }

    utterance.onstart = () => {
      state.currentlySpeakingUtterance = utterance;
      if (btnElement) {
        btnElement.classList.add('active');
        btnElement.querySelector('span').innerText = 'Stop';
      }
    };

    utterance.onend = utterance.onerror = () => {
      state.currentlySpeakingUtterance = null;
      if (btnElement) {
        btnElement.classList.remove('active');
        btnElement.querySelector('span').innerText = 'Listen';
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  // ==========================================================================
  // Speech-To-Text (Voice Dictation)
  // ==========================================================================
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      DOM.micBtn.title = 'Voice input not supported in this browser';
      DOM.micBtn.style.opacity = '0.5';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // Also responds to Tamil if set to 'ta-IN'

    recognition.onstart = () => {
      state.isListening = true;
      DOM.micBtn.classList.add('listening');
      showToast('Listening... Speak now! 🎙️');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      DOM.chatInput.value = transcript;
      updateInputHeight();
      checkInputState();
    };

    recognition.onerror = () => {
      state.isListening = false;
      DOM.micBtn.classList.remove('listening');
    };

    recognition.onend = () => {
      state.isListening = false;
      DOM.micBtn.classList.remove('listening');
    };

    state.recognition = recognition;
  }

  function toggleVoiceInput() {
    if (!state.recognition) {
      showToast('Voice input is not supported in this browser.');
      return;
    }

    if (state.isListening) {
      state.recognition.stop();
    } else {
      try {
        state.recognition.start();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  // ==========================================================================
  // AI Inference Engine
  // ==========================================================================
  function getDateTimeReply(question, now) {
    const asksDate = /\b(today(?:['’]s)?\s+date|date\s+(?:today|now)|current\s+date|what(?:'s| is)\s+(?:the\s+)?date|what\s+day\s+is\s+(?:it|today)|day\s+today)\b/i.test(question) ||
      /\bwhat\s+date\s+is\s+it\b/i.test(question) ||
      /(?:தேதி|கிழமை|என்ன நாள்)/.test(question) ||
      /\b(?:innaiku|inniku|indru)\b.*\bdate\b|\bdate\b.*\b(?:enna|innaiku|inniku|indru|ippo|ipo)\b/i.test(question);
    const asksTime = /\b(current\s+time|time\s+now|now\s+time|what(?:'s| is)\s+(?:the\s+)?time|what\s+time\s+is\s+it|tell\s+me\s+the\s+time|clock)\b/i.test(question) ||
      (asksDate && /\btime\b/i.test(question)) ||
      /(?:நேரம்|மணி)/.test(question) ||
      /\b(?:time\s+enna|enna\s+time|ippo\s+time|ipo\s+time|time\s+ippo|time\s+ipo)\b/i.test(question);

    if (!asksDate && !asksTime) return null;

    const isTamil = /[\u0B80-\u0BFF]/.test(question) ||
      /\b(?:innaiku|inniku|indru|enna|ippo|ipo|neram|mani)\b/i.test(question);
    const locale = isTamil ? 'ta-IN' : 'en-IN';
    const date = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
    const timeParts = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short'
    }).formatToParts(now);
    const time = timeParts.filter(part => ['hour', 'minute', 'second'].includes(part.type))
      .map(part => part.value)
      .join(':');
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time zone';
    const zoneLabel = timeParts.find(part => part.type === 'timeZoneName')?.value || timeZone;

    if (isTamil) {
      const details = [];
      if (asksDate) details.push(`இன்றைய தேதி: ${date}`);
      if (asksTime) details.push(`தற்போதைய நேரம்: ${time} (${zoneLabel}, ${timeZone})`);
      return details.join('\n');
    }

    const details = [];
    if (asksDate) details.push(`Today's date is ${date}.`);
    if (asksTime) details.push(`The current local time is ${time} (${zoneLabel}, ${timeZone}).`);
    return details.join('\n');
  }

  function getLiveDateTimeContext(now) {
    const dateTime = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeStyle: 'long'
    }).format(now);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'the device local time zone';
    return `\n\nLive date and time context: The user's device currently reports ${dateTime} (${timeZone}). Use this as the source of truth for questions about the current date or time.`;
  }

  async function callAIModel(messages, onChunk) {
    const currentModel  = state.settings.model || 'claude-3-5-sonnet';
    const now           = new Date();
    const currentQuestion = [...messages].reverse().find(message => message.role === 'user')?.content || '';
    const exactDateTimeReply = getDateTimeReply(currentQuestion, now);
    if (exactDateTimeReply) {
      onChunk(exactDateTimeReply);
      return exactDateTimeReply;
    }

    const systemPrompt  = (state.settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt) +
      getLiveDateTimeContext(now);
    const sig           = state.abortController ? state.abortController.signal : undefined;

    // ── Strategy 0 : Ollama Local (llama3.2 via ollama_server.py) ─────────
    if (currentModel === 'ollama-llama3') {
      const body = JSON.stringify({ messages, system: systemPrompt, model: 'llama3.2' });
      try {
        const r = await fetch(`${OLLAMA_API}/chat/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: sig
        });
        if (r.ok) {
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let acc = '', buf = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop();
            for (const ln of lines) {
              if (!ln.startsWith('data: ')) continue;
              const raw = ln.slice(6).trim();
              if (raw === '[DONE]') break;
              try { const p = JSON.parse(raw); if (p.chunk) { acc += p.chunk; onChunk(acc); } } catch (_) {}
            }
          }
          if (acc.trim()) return acc;
        }
      } catch (e) { if (e.name === 'AbortError') throw e; }
      // plain fallback
      const fb = await fetch(`${OLLAMA_API}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: sig
      });
      if (!fb.ok) throw new Error('Ollama server not running. Start ollama_server.py first.');
      const fbd = await fb.json();
      if (fbd.error) throw new Error(fbd.error);
      return fbd.reply;
    }

    if (!window.puter || !window.puter.ai || typeof window.puter.ai.chat !== 'function') {
      throw new Error('The AI service did not load. Check your internet connection and refresh the page.');
    }

    if (window.puter.auth && typeof window.puter.auth.isSignedIn === 'function' &&
        !await window.puter.auth.isSignedIn()) {
      if (typeof window.puter.auth.signIn !== 'function') {
        throw new Error('Sign in to Puter to use cloud AI.');
      }
      await window.puter.auth.signIn();
    }

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(message => ({ role: message.role, content: message.content }))
    ];
    const model = PUTER_MODEL_MAP[currentModel] || PUTER_MODEL_MAP['claude-3-5-sonnet'];
    const stream = await window.puter.ai.chat(chatMessages, {
      model,
      stream: true,
      normalize: true
    });

    let answer = '';
    for await (const chunk of stream) {
      if (sig && sig.aborted) {
        const abortError = new Error('Generation stopped');
        abortError.name = 'AbortError';
        throw abortError;
      }
      if (chunk.type === 'error') {
        throw new Error(chunk.message || 'The AI service interrupted the response.');
      }
      if (chunk.type === 'text' && chunk.text) {
        answer += chunk.text;
        onChunk(answer);
      }
    }

    if (!answer.trim()) throw new Error('AI returned an empty response. Please try again.');
    return answer;
  }

  // ==========================================================================
  // Message Handling & Streaming Simulator
  // ==========================================================================
  async function sendMessage(userText) {
    if (!userText || !userText.trim()) return;
    if (state.isGenerating) return;

    const chat = getActiveChat();
    if (!chat) return;

    const trimmed = userText.trim();
    DOM.chatInput.value = '';
    updateInputHeight();
    checkInputState();

    // Auto update chat title on first message
    if (chat.messages.length === 0) {
      chat.title = trimmed.length > 28 ? trimmed.substring(0, 28) + '...' : trimmed;
      renderChatHistory();
    }

    // Add User Message
    const userMsg = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString()
    };
    chat.messages.push(userMsg);
    saveChats();

    DOM.welcomeHero.classList.add('hidden');
    appendMessageElement('user', trimmed, chat.messages.length - 1);
    scrollToBottom();

    // Setup Generation State
    state.isGenerating = true;
    state.abortController = new AbortController();
    DOM.typingIndicator.classList.remove('hidden');
    DOM.stopGeneratingWrapper.classList.remove('hidden');
    scrollToBottom();

    // Create placeholder Bot Message Row
    const botRow = document.createElement('div');
    botRow.className = 'message-row bot-row';
    botRow.innerHTML = `
      <div class="bot-msg-avatar">
        <div class="bot-avatar-inner">🌸</div>
      </div>
      <div class="bot-message-wrapper" style="width: 100%;">
        <div class="bot-bubble-card streaming-card">
          <span class="stream-cursor">▌</span>
        </div>
      </div>
    `;
    DOM.messagesList.appendChild(botRow);
    const bubbleCard = botRow.querySelector('.bot-bubble-card');

    try {
      let finalAnswer = '';
      
      const onChunk = (partialText) => {
        finalAnswer = partialText;
        if (window.marked) {
          bubbleCard.innerHTML = marked.parse(partialText) + `<span class="stream-cursor">▌</span>`;
        } else {
          bubbleCard.textContent = partialText;
        }
        scrollToBottom();
      };

      const result = await callAIModel(chat.messages, onChunk);
      
      if (!finalAnswer && result) {
        // Smooth typewriter simulation if the response came in a single fetch
        finalAnswer = result;
        await streamTypewriter(result, bubbleCard);
      }

      // Finalize Bot Message
      DOM.typingIndicator.classList.add('hidden');
      DOM.stopGeneratingWrapper.classList.add('hidden');

      const botMsg = {
        role: 'assistant',
        content: finalAnswer,
        timestamp: new Date().toISOString()
      };
      chat.messages.push(botMsg);
      saveChats();

      // Replace temporary element with complete card & action bar
      botRow.remove();
      appendMessageElement('assistant', finalAnswer, chat.messages.length - 1);
      scrollToBottom();
      playChimeSound();

    } catch (err) {
      if (err.name === 'AbortError') {
        bubbleCard.innerHTML += `<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;"><em>(Generation stopped)</em></p>`;
      } else {
        console.error('Inference error:', err);
        const errLines = (err.message || 'Please check your connection and try again.')
          .split('\n').map(l => escapeHtml(l)).join('<br>');
        bubbleCard.innerHTML = `
          <div style="color: #e11d48; font-weight: 600; margin-bottom: 8px;">
            ⚠️ Unable to get a response
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
            ${errLines}
          </div>
          <div style="margin-top: 12px;">
            <button onclick="this.closest('.bot-bubble-card').dispatchEvent(new Event('retry'))"
              style="background: var(--primary-pink); color: #fff; border: none; padding: 6px 16px;
                     border-radius: 20px; font-size: 0.82rem; cursor: pointer; font-weight: 600;">
              🔄 Retry
            </button>
          </div>
        `;
      }
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      DOM.typingIndicator.classList.add('hidden');
      DOM.stopGeneratingWrapper.classList.add('hidden');
      DOM.chatInput.focus();
    }
  }

  // Smooth Typewriter Simulation
  function streamTypewriter(fullText, element) {
    return new Promise(resolve => {
      const words = fullText.split(' ');
      let current = '';
      let i = 0;

      function step() {
        if (state.abortController && state.abortController.signal.aborted) {
          resolve();
          return;
        }
        if (i < words.length) {
          current += (i === 0 ? '' : ' ') + words[i];
          if (window.marked) {
            element.innerHTML = marked.parse(current) + `<span class="stream-cursor">▌</span>`;
          } else {
            element.innerText = current;
          }
          scrollToBottom();
          i++;
          const delay = Math.min(25, Math.max(8, 150 / words.length));
          setTimeout(step, delay);
        } else {
          resolve();
        }
      }
      step();
    });
  }

  function handleRegenerate(index) {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) return;

    // Find the user prompt preceding this bot response
    let promptIndex = index - 1;
    if (promptIndex >= 0 && chat.messages[promptIndex].role === 'user') {
      const promptText = chat.messages[promptIndex].content;
      // Remove this bot message and any subsequent messages
      chat.messages = chat.messages.slice(0, promptIndex + 1);
      saveChats();
      renderActiveChat();
      
      // Resend prompt
      const userLast = chat.messages.pop(); // pop temporarily so sendMessage can push cleanly
      sendMessage(userLast.content);
    }
  }

  // ==========================================================================
  // Export Conversation
  // ==========================================================================
  function exportConversation() {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) {
      showToast('No messages to export yet!');
      return;
    }

    let markdown = `# ${chat.title}\n*Exported from RoseAI on ${new Date().toLocaleString()}*\n\n---\n\n`;
    chat.messages.forEach(msg => {
      const speaker = msg.role === 'user' ? '👤 **You**' : '🌸 **RoseAI**';
      markdown += `${speaker}:\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chat.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Conversation exported as Markdown!');
  }

  // ==========================================================================
  // Theme & Settings
  // ==========================================================================
  function applyThemePalette(paletteName) {
    document.body.setAttribute('data-palette', paletteName);
    state.settings.palette = paletteName;
    saveSettings();

    DOM.paletteChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.palette === paletteName);
    });
  }

  function cycleTheme() {
    const palettes = ['pink-sakura', 'pink-rose', 'pink-candy'];
    const currentIdx = palettes.indexOf(state.settings.palette || 'pink-sakura');
    const nextPalette = palettes[(currentIdx + 1) % palettes.length];
    applyThemePalette(nextPalette);
    showToast(`Switched theme: ${nextPalette.replace('-', ' ').toUpperCase()} 🌸`);
  }

  function openSettings() {
    DOM.systemPromptInput.value = state.settings.systemPrompt;
    DOM.apiProviderSelect.value = state.settings.apiProvider;
    DOM.customApiKeyInput.value = state.settings.customApiKey || '';
    DOM.soundEffectsToggle.checked = !!state.settings.soundEnabled;
    DOM.settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    DOM.settingsModal.classList.add('hidden');
  }

  function saveSettingsFromModal() {
    state.settings.systemPrompt = DOM.systemPromptInput.value.trim() || DEFAULT_SETTINGS.systemPrompt;
    state.settings.apiProvider = DOM.apiProviderSelect.value;
    state.settings.customApiKey = DOM.customApiKeyInput.value.trim();
    state.settings.soundEnabled = DOM.soundEffectsToggle.checked;
    saveSettings();
    closeSettings();
    showToast('Settings saved successfully!');
  }

  function resetSettings() {
    if (confirm('Reset settings to default?')) {
      state.settings = { ...DEFAULT_SETTINGS };
      saveSettings();
      openSettings();
      applyThemePalette(DEFAULT_SETTINGS.palette);
      showToast('Settings reset to default');
    }
  }

  // ==========================================================================
  // Helper UI Utilities
  // ==========================================================================
  function showToast(message) {
    DOM.toastMessage.innerText = message;
    DOM.toastNotification.classList.remove('hidden');
    setTimeout(() => {
      DOM.toastNotification.classList.add('hidden');
    }, 2800);
  }

  function updateInputHeight() {
    DOM.chatInput.style.height = 'auto';
    DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 180) + 'px';
  }

  function checkInputState() {
    DOM.sendBtn.disabled = !DOM.chatInput.value.trim() || state.isGenerating;
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  function initEventListeners() {
    // Sidebar Toggles
    DOM.toggleSidebarBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        DOM.sidebar.classList.toggle('mobile-open');
      } else {
        DOM.sidebar.classList.toggle('collapsed');
      }
    });

    DOM.closeSidebarBtn.addEventListener('click', () => {
      DOM.sidebar.classList.remove('mobile-open');
      DOM.sidebar.classList.add('collapsed');
    });

    DOM.newChatBtn.addEventListener('click', () => {
      createNewChat(true);
    });

    DOM.clearAllChatsBtn.addEventListener('click', clearAllChats);

    // Model Selector Dropdown
    DOM.modelSelectorPill.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.modelDropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      DOM.modelDropdownMenu.classList.remove('show');
    });

    DOM.modelDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const modelId = item.dataset.model;
        state.settings.model = modelId;
        saveSettings();

        DOM.modelDropdownMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const titleText = item.querySelector('.model-title').childNodes[0].nodeValue.trim();
        DOM.currentModelDisplay.innerText = titleText;
        showToast(`Model set to: ${titleText}`);
      });
    });

    // Suggestion Cards on Welcome Screen
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        if (prompt) {
          DOM.chatInput.value = prompt;
          sendMessage(prompt);
        }
      });
    });

    // Input & Send
    DOM.chatInput.addEventListener('input', () => {
      updateInputHeight();
      checkInputState();
    });

    DOM.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(DOM.chatInput.value);
      }
    });

    DOM.sendBtn.addEventListener('click', () => {
      sendMessage(DOM.chatInput.value);
    });

    // Voice Mic
    DOM.micBtn.addEventListener('click', toggleVoiceInput);

    // Stop Generating
    DOM.stopGeneratingBtn.addEventListener('click', () => {
      if (state.abortController) {
        state.abortController.abort();
      }
    });

    // Export Chat
    DOM.exportChatBtn.addEventListener('click', exportConversation);

    // Theme Toggle
    DOM.themeToggleBtn.addEventListener('click', cycleTheme);

    // Settings Modal
    DOM.openSettingsBtn.addEventListener('click', openSettings);
    DOM.closeSettingsBtn.addEventListener('click', closeSettings);
    DOM.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);
    DOM.resetSettingsBtn.addEventListener('click', resetSettings);

    DOM.settingsModal.addEventListener('click', (e) => {
      if (e.target === DOM.settingsModal) closeSettings();
    });

    DOM.paletteChips.forEach(chip => {
      chip.addEventListener('click', () => {
        applyThemePalette(chip.dataset.palette);
      });
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  function init() {
    loadFromStorage();
    applyThemePalette(state.settings.palette || 'pink-sakura');
    
    // Set active model display name
    const activeModelItem = document.querySelector(`.dropdown-item[data-model="${state.settings.model}"]`);
    if (activeModelItem) {
      document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      activeModelItem.classList.add('active');
      DOM.currentModelDisplay.innerText = activeModelItem.querySelector('.model-title').childNodes[0].nodeValue.trim();
    }

    renderChatHistory();
    renderActiveChat();
    initSpeechRecognition();
    initEventListeners();
    updateInputHeight();
    checkInputState();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
