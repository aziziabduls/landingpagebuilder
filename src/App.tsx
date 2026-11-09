
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IconChevronDown, IconChevronUp, IconReload } from '@tabler/icons-react';
import JSZip from 'jszip';
import { Check, Code, Download, Edit2, Film, Image as ImageIcon, Key, Laptop, Layout, Moon, RotateCcw, Shield, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AiPrompt } from './components/AiPrompt';
import WebThreads from './components/WebThreads';

// Helper to inject the editing bridge script into generated HTML
const injectBridgeScript = (html: string) => {
  const bridgeScript = `
    <!-- AI_EDIT_BRIDGE_START -->
    <script>
      (function() {
        // Highlight styles
        const style = document.createElement('style');
        style.textContent = '.ai-editable-highlight { outline: 2px dashed #6366f1 !important; outline-offset: 2px !important; cursor: pointer !important; position: relative !important; } .ai-editable-highlight::after { content: "Edit"; position: absolute; top: -24px; right: 0; background: #6366f1; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-family: sans-serif; pointer-events: none; z-index: 10000; }';
        document.head.appendChild(style);

        let lastElement = null;

        document.addEventListener('mouseover', (e) => {
          const el = e.target.closest('[data-ai-id]');
          if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;
          
          if (lastElement && lastElement !== el) lastElement.classList.remove('ai-editable-highlight');
          el.classList.add('ai-editable-highlight');
          lastElement = el;
        });

        document.addEventListener('click', (e) => {
          const el = e.target.closest('[data-ai-id]');
          if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;

          e.preventDefault();
          e.stopPropagation();

          // Find specific editable information
          let href = el.getAttribute('href') || '';
          let hrefType = 'url';
          if (href.startsWith('mailto:')) {
            hrefType = 'email';
            href = href.replace('mailto:', '');
          } else if (href.startsWith('tel:')) {
            hrefType = 'phone';
            href = href.replace('tel:', '');
          } else if (href.startsWith('https://wa.me/')) {
            hrefType = 'whatsapp';
            href = href.replace('https://wa.me/', '');
          }

          const data = {
            type: 'element-selected',
            tagName: el.tagName,
            aiId: el.getAttribute('data-ai-id'),
            innerText: el.innerText,
            attributes: {},
            hrefType: hrefType,
            hrefValue: href,
            rect: el.getBoundingClientRect()
          };

          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            data.attributes[attr.name] = attr.value;
          }

          window.parent.postMessage(data, '*');
        });

        window.addEventListener('message', (e) => {
          const { type, payload } = e.data;
          if (type === 'update-element') {
            const { aiId, content, attributes } = payload;
            const el = document.querySelector("[data-ai-id=\\"" + aiId + "\\"]");
            if (!el) return;

            if (content !== undefined) el.innerText = content;
            if (attributes) {
              for (const [key, value] of Object.entries(attributes)) {
                if (value === null) {
                   el.removeAttribute(key);
                } else {
                   el.setAttribute(key, value);
                }
              }
            }
          }
        });
      })();
    </script>
    <!-- AI_EDIT_BRIDGE_END -->
  `;
  return html.replace('</body>', bridgeScript + '</body>');
};

// Helper to add unique IDs to all elements in the HTML
const addUniqueIds = (html: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const allElements = doc.body.querySelectorAll('*');
  allElements.forEach((el, index) => {
    if (!el.getAttribute('data-ai-id')) {
      el.setAttribute('data-ai-id', 'el-' + index);
    }
  });
  return doc.documentElement.outerHTML;
};



const SYSTEM_PROMPT = `You are an expert web developer and designer. Your task is to design and build a modern, high-converting landing page based on the user's prompt and any provided materials (like a company profile document).

IMPORTANT RULES:
1. Output ONLY RAW HTML. Do NOT include markdown formatting wrappers (like \`\`\`html ... \`\`\`). The output should start directly with <!DOCTYPE html>.
2. Do not include any explanations or conversational text before or after the HTML.
3. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>. Add a <style type="text/tailwindcss"> block with '@layer utilities { html { scroll-behavior: smooth; } }'.
4. Use beautiful typography (e.g., 'Jakarta Plus Sans', 'Inter', 'Playfair Display', 'JetBrains Mono', 'Cormorant Garamond') from Google Fonts.
5. Use generic image placeholders if needed, e.g., https://placehold.co/800x600/eee/31343c.
6. Make the Navbar CTA interactive and able to navigate: give the main Call to Action section an id (e.g., id="cta" or id="pricing") and make the Navbar CTA button link to it (e.g., href="#cta").
7. AESTHETICS (CRITICAL): Apply high-end frontend design recipes. Reject generic "AI Slop" like default purple/blue gradients or box shadows everywhere. Use intentional pairings:
   - For a SaaS look: Split layouts, massive headlines, floating elements, and vertical rail text.
   - For an Editorial look: Massive typography (line-height 0.8), pure black/white contrast, skewed wrappers, huge images, and tiny uppercase micro-labels.
   - For a Warm Organic look: Serif fonts, warm off-white backgrounds (#f5f5f0), muted olive accents, pill-shaped images, and offset underlines.
   Ensure you specify exactly one cohesive styling mood and apply rhythm through intentional padding/margin variation.
8. If the user provides a PDF or text about their company, extract their brand name, description, services, and values to populate the landing page content accurately.
9. Finish directly with </html>. Do NOT output any additional text, markdown, or explanations after the closing </html> tag.`;


export const PROVIDER_MODELS = {
  gemini: [
    // --- Seri Gemini 3.x (Terbaru & Unggulan) ---
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },

    // --- Seri Gemini Multimodal & Omni ---
    { value: 'gemini-omni-1.1-flash', label: 'Gemini Omni 1.1 Flash' },
    { value: 'gemini-omni-flash-preview', label: 'Gemini Omni Flash Preview' },
    { value: 'gemini-3.8-live', label: 'Gemini 3.8 Live (Voice)' },

    // --- Seri Gemini 2.5 (Stable / Legacy Actives) ---
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' }
  ],
  openai: [
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (gpt-5.6-sol)' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (gpt-5.6-terra)' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (gpt-5.6-luna)' },
    { value: 'gpt-5.5', label: 'GPT-5.5 (gpt-5.5)' },
    { value: 'gpt-5.4', label: 'GPT-5.4 (gpt-5.4)' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex (gpt-5.3-codex)' },
    { value: 'o3', label: 'o3 (o3)' },
    { value: 'o4-mini', label: 'o4-mini (o4-mini)' },
  ],
  anthropic: [
    { value: 'claude-fable-5', label: 'Claude Fable 5 (claude-fable-5)' },
    { value: 'claude-opus-5', label: 'Claude Opus 5 (claude-opus-5)' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (claude-sonnet-5)' },
    { value: 'claude-opus-4.8', label: 'Claude Opus 4.8 (claude-opus-4.8)' },
    { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (claude-sonnet-4.6)' },
    { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (claude-haiku-4.5)' },
  ]
};

export default function App() {
  // Show guide popup state
  const [showGuide, setShowGuide] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState('');
  const [activeTab, setActiveTab] = useState('preview');
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const generateIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAbort = () => {
    generateIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setStreamingCode('');
  };
  const [mediaFiles, setMediaFiles] = useState<{ [key: string]: File }>({});
  const [blobToFileName, setBlobToFileName] = useState<{ [key: string]: string }>({});
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        return savedTheme as 'light' | 'dark' | 'system';
      }
    }
    return 'system';
  });

  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const theme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

  // API Key Settings States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [saveLocation, setSaveLocation] = useState<'session' | 'local'>('local');
  const [isMobile, setIsMobile] = useState(false);
  const [isPromptVisible, setIsPromptVisible] = useState(false);

  // Model & Provider States
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'anthropic'>('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const isLocal = !!(
      localStorage.getItem('ai_provider') ||
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('openai_api_key') ||
      localStorage.getItem('anthropic_api_key')
    );
    setSaveLocation(isLocal ? 'local' : 'session');

    const storage = isLocal ? localStorage : sessionStorage;

    const savedProvider = (storage.getItem('ai_provider') as 'gemini' | 'openai' | 'anthropic') || 'gemini';
    const savedModel = storage.getItem('ai_model') || 'gemini-3.8-flash';
    const savedGemini = storage.getItem('gemini_api_key') || '';
    const savedOpenai = storage.getItem('openai_api_key') || '';
    const savedAnthropic = storage.getItem('anthropic_api_key') || '';

    setProvider(savedProvider);
    setSelectedModel(savedModel);
    setGeminiKeyInput(savedGemini);
    setOpenaiKeyInput(savedOpenai);
    setAnthropicKeyInput(savedAnthropic);
  }, []);

  const handleProviderChange = (newProvider: 'gemini' | 'openai' | 'anthropic') => {
    setProvider(newProvider);
    if (newProvider === 'gemini') setSelectedModel('gemini-3.8-flash');
    else if (newProvider === 'openai') setSelectedModel('gpt-5.6-sol');
    else if (newProvider === 'anthropic') setSelectedModel('claude-fable-5');
  };

  const handleProviderChangeGlobal = (newProvider: 'gemini' | 'openai' | 'anthropic') => {
    handleProviderChange(newProvider);
    const storage = saveLocation === 'local' ? localStorage : sessionStorage;
    storage.setItem('ai_provider', newProvider);

    let newModel = 'gemini-3.8-flash';
    if (newProvider === 'openai') newModel = 'gpt-5.6-sol';
    else if (newProvider === 'anthropic') newModel = 'claude-fable-5';
    storage.setItem('ai_model', newModel);
  };

  const handleModelChangeGlobal = (newModel: string, newProvider: 'gemini' | 'openai' | 'anthropic') => {
    setProvider(newProvider);
    setSelectedModel(newModel);
    const storage = saveLocation === 'local' ? localStorage : sessionStorage;
    storage.setItem('ai_provider', newProvider);
    storage.setItem('ai_model', newModel);
  };

  const handleSaveApiKey = () => {
    const storage = saveLocation === 'local' ? localStorage : sessionStorage;
    const otherStorage = saveLocation === 'local' ? sessionStorage : localStorage;

    otherStorage.removeItem('ai_provider');
    otherStorage.removeItem('ai_model');
    otherStorage.removeItem('gemini_api_key');
    otherStorage.removeItem('openai_api_key');
    otherStorage.removeItem('anthropic_api_key');

    storage.setItem('ai_provider', provider);
    storage.setItem('ai_model', selectedModel);
    storage.setItem('gemini_api_key', geminiKeyInput);
    storage.setItem('openai_api_key', openaiKeyInput);
    storage.setItem('anthropic_api_key', anthropicKeyInput);

    setIsSettingsOpen(false);
  };

  const themeStyles = {
    root: theme === 'dark' ? 'bg-neutral-950 text-neutral-50' : 'bg-white text-neutral-900',
    surface: theme === 'dark' ? 'bg-neutral-950/95' : 'bg-slate-50/95',
    card: theme === 'dark' ? 'bg-neutral-900/90 border-neutral-800/50' : 'bg-white/90 border-neutral-200/50',
    panel: theme === 'dark' ? 'bg-neutral-950/30' : 'bg-neutral-50/30',
    header: theme === 'dark' ? 'bg-neutral-900/70 border-neutral-800/50 ring-white/5' : 'bg-white/70 border-neutral-200/50 ring-black/5',
    chip: theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-50' : 'bg-white border-neutral-200 text-neutral-900',
    inputGroup: theme === 'dark' ? 'bg-neutral-900 shadow-xl border-neutral-800' : 'bg-white shadow-xl border-neutral-200',
    inputGroupActive: theme === 'dark' ? 'bg-neutral-900/80 border-neutral-800/50 ring-white/5' : 'bg-white/80 border-neutral-200/50 ring-black/5',
    accentButton: theme === 'dark' ? 'bg-white text-neutral-950 hover:bg-neutral-100' : 'bg-neutral-900 text-white hover:bg-neutral-800',
    toggleButton: theme === 'dark' ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/50' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/50',
    tabBar: theme === 'dark' ? 'bg-neutral-950/50 border-neutral-800' : 'bg-neutral-100/80 border-neutral-200/50',
    tabHeader: theme === 'dark' ? 'bg-neutral-900/50 border-neutral-800/50' : 'bg-neutral-50/50 border-neutral-100',
    overlay: theme === 'dark' ? 'bg-neutral-900/80' : 'bg-white/80',
    iframe: theme === 'dark' ? 'bg-neutral-950' : 'bg-white',
    textMuted: theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600',
    textStrong: theme === 'dark' ? 'text-neutral-50' : 'text-neutral-950',
    textAccent: theme === 'dark' ? 'text-sky-300' : 'text-sky-600',
    textSubtle: theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500',
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.dataset.theme = 'dark';
    } else {
      root.classList.remove('dark');
      root.dataset.theme = 'light';
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', themeMode);
    }
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Handle messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'element-selected') {
        const el = event.data;
        setSelectedElement(el);
        setIsDrawerOpen(true);

        // Pre-fill the form
        const initialForm: any = {
          content: el.innerText,
          tagName: el.tagName,
          hrefType: el.hrefType,
          href: el.hrefValue || ''
        };

        // Extract attributes
        if (el.tagName === 'IMG') initialForm.src = el.attributes.src;
        if (el.tagName === 'VIDEO') {
          initialForm.src = el.attributes.src;
          initialForm.loop = el.attributes.loop !== undefined;
        }

        setEditForm(initialForm);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleUpdateElement = () => {
    if (!selectedElement) return;

    const payload: any = {
      aiId: selectedElement.aiId,
      content: editForm.content,
      attributes: {}
    };

    if (selectedElement.tagName === 'IMG') payload.attributes.src = editForm.src;
    if (selectedElement.tagName === 'VIDEO') {
      payload.attributes.src = editForm.src;
      if (editForm.loop) payload.attributes.loop = '';
      else payload.attributes.loop = null; // null triggers removeAttribute in bridge
    }
    if (selectedElement.tagName === 'A') {
      let href = editForm.href;
      // Handle special links
      if (editForm.hrefType === 'email') href = `mailto:${editForm.href}`;
      else if (editForm.hrefType === 'phone') href = `tel:${editForm.href}`;
      else if (editForm.hrefType === 'whatsapp') href = `https://wa.me/${editForm.href.replace(/\+/g, '')}`;
      payload.attributes.href = href;
    }

    // Update the iframe
    iframeRef.current?.contentWindow?.postMessage({
      type: 'update-element',
      payload
    }, '*');

    // Also update the local state so it persists on tab switch
    const parser = new DOMParser();
    const doc = parser.parseFromString(generatedHtml!, 'text/html');
    const el = doc.querySelector(`[data-ai-id="${selectedElement.aiId}"]`);
    if (el) {
      if (payload.content !== undefined) (el as HTMLElement).innerText = payload.content;
      for (const [key, value] of Object.entries(payload.attributes)) {
        if (value === null) {
          el.removeAttribute(key);
        } else {
          el.setAttribute(key, value as string);
        }
      }
      setGeneratedHtml(doc.documentElement.outerHTML);
    }

    setIsDrawerOpen(false);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setEditForm({ ...editForm, src: url });

    // Store for zip export
    const fileName = `${type}_${Date.now()}_${file.name}`;
    setMediaFiles(prev => ({ ...prev, [fileName]: file }));
    setBlobToFileName(prev => ({ ...prev, [url]: `media/${fileName}` }));
  };

  const handleZipExport = async () => {
    if (!generatedHtml) return;

    const zip = new JSZip();
    const mediaFolder = zip.folder("media");

    let finalHtml = generatedHtml;

    // Replace blob URLs with local media paths in the HTML
    for (const [blobUrl, localPath] of Object.entries(blobToFileName)) {
      finalHtml = finalHtml.split(blobUrl).join(localPath);
    }

    // Clean up the bridge script for final export using unique markers
    finalHtml = finalHtml.replace(/<!-- AI_EDIT_BRIDGE_START -->[\s\S]*?<!-- AI_EDIT_BRIDGE_END -->/, '');

    zip.file("index.html", finalHtml);

    for (const [name, file] of Object.entries(mediaFiles)) {
      mediaFolder?.file(name, file as Blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'landing-page.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleGenerate = async (submitPrompt?: string, submitFile?: File) => {
    const currentId = ++generateIdRef.current;
    const currentPrompt = submitPrompt ?? prompt;
    let currentFile = submitFile ?? file;
    let currentBase64 = fileBase64;

    if (submitFile && submitFile !== file) {
      currentBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(submitFile);
      });
      if (currentId !== generateIdRef.current) return;
      setFile(submitFile);
      setFileBase64(currentBase64 as string);
    }
    setPrompt(currentPrompt);

    if (!currentPrompt.trim() && !currentFile) return;

    const activeProvider = sessionStorage.getItem('ai_provider') || localStorage.getItem('ai_provider') || 'gemini';
    const activeApiKey = sessionStorage.getItem(`${activeProvider}_api_key`) || localStorage.getItem(`${activeProvider}_api_key`) || '';
    if (!activeApiKey) {
      setAlertDialog({ isOpen: true, title: 'Configuration Required', message: `Please configure your API key in settings before generating.` });
      setIsSettingsOpen(true);
      return;
    }

    setIsGenerating(true);
    setGeneratedHtml(null);
    setStreamingCode('');
    setGenerationError(null);
    setActiveTab('preview');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const parts: any[] = [];

      if (currentFile && currentBase64) {
        parts.push({
          text: `[REFERENCE FILE]: I have attached a reference document (${currentFile.name}). Please read this file carefully and extract all relevant information (such as brand name, services, products, values, colors, or general guidelines) to use as the primary source of truth for the landing page content.`
        });
        parts.push({
          inlineData: {
            mimeType: currentFile.type || 'application/pdf',
            data: currentBase64
          }
        });
      }

      parts.push({
        text: `[USER REQUEST]: ${currentPrompt || 'Generate a landing page based on the attached reference document.'}`
      });

      let html = '';
      const activeProvider = sessionStorage.getItem('ai_provider') || localStorage.getItem('ai_provider') || 'gemini';
      const activeModel = sessionStorage.getItem('ai_model') || localStorage.getItem('ai_model') || 'gemini-3.8-flash';

      if (activeProvider === 'gemini') {
        const activeApiKey = sessionStorage.getItem('gemini_api_key') || localStorage.getItem('gemini_api_key');
        if (!activeApiKey) throw new Error("Gemini API key missing");
        const customAi = new GoogleGenerativeAI(activeApiKey);
        const model = customAi.getGenerativeModel({
          model: activeModel,
          systemInstruction: SYSTEM_PROMPT,
        });

        const responseStream = await model.generateContentStream({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.7,
          }
        });
        for await (const chunk of responseStream.stream) {
          if (currentId !== generateIdRef.current) return;
          const text = chunk.text();
          html += text;
          setStreamingCode(html);
        }
      } else if (activeProvider === 'openai') {
        const activeApiKey = sessionStorage.getItem('openai_api_key') || localStorage.getItem('openai_api_key');
        if (!activeApiKey) {
          throw new Error("OpenAI API key is missing. Please configure it in Settings.");
        }

        const messages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT }
        ];

        const userContent: any[] = [];

        if (currentFile && currentBase64) {
          if (currentFile.type.startsWith('image/')) {
            userContent.push({
              type: 'text',
              text: `[REFERENCE IMAGE]: I have attached a reference image (${currentFile.name}). Use this image as design/layout guidance.`
            });
            userContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${currentFile.type};base64,${currentBase64}`
              }
            });
          } else {
            userContent.push({
              type: 'text',
              text: `(Note: Attached reference file "${currentFile.name}" of type ${currentFile.type} is omitted because OpenAI API does not support native document uploads in chat completions. Please focus on the text prompt below.)`
            });
          }
        }

        userContent.push({
          type: 'text',
          text: `[USER REQUEST]: ${currentPrompt || 'Generate a landing page based on the prompt.'}`
        });

        messages.push({ role: 'user', content: userContent });

        const apiResponse = await fetch('/api-proxy/openai/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeApiKey}`
          },
          body: JSON.stringify({
            model: activeModel,
            messages,
            temperature: 0.7
          })
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `OpenAI API returned status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();
        html = responseData.choices?.[0]?.message?.content || '';
      } else if (activeProvider === 'anthropic') {
        const activeApiKey = sessionStorage.getItem('anthropic_api_key') || localStorage.getItem('anthropic_api_key');
        if (!activeApiKey) {
          throw new Error("Anthropic API key is missing. Please configure it in Settings.");
        }

        const contentBlocks: any[] = [];

        if (currentFile && currentBase64) {
          if (currentFile.type.startsWith('image/')) {
            let mediaType = currentFile.type;
            if (mediaType === 'image/jpg') mediaType = 'image/jpeg';

            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: currentBase64
              }
            });
            contentBlocks.push({
              type: 'text',
              text: `[REFERENCE IMAGE]: I have attached a reference image (${currentFile.name}) above. Use this as design/layout guidance.`
            });
          } else {
            contentBlocks.push({
              type: 'text',
              text: `(Note: Attached reference file "${currentFile.name}" of type ${currentFile.type} is omitted because Anthropic API does not support native document uploads in chat completions. Please focus on the text prompt below.)`
            });
          }
        }

        contentBlocks.push({
          type: 'text',
          text: `[USER REQUEST]: ${currentPrompt || 'Generate a landing page based on the prompt.'}`
        });

        const apiResponse = await fetch('/api-proxy/anthropic/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': activeApiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: activeModel,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            messages: [
              { role: 'user', content: contentBlocks }
            ],
            temperature: 0.7
          })
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Anthropic API returned status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();
        html = responseData.content?.[0]?.text || '';
      }

      if (currentId !== generateIdRef.current) return;

      html = html.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
      html = html.trim();

      const htmlWithIds = addUniqueIds(html);
      setGeneratedHtml(injectBridgeScript(htmlWithIds));
      setActiveTab('preview');
      // setShowGuide(true);
    } catch (error) {
      if (currentId !== generateIdRef.current) return;
      console.error("Error generating landing page:", error);
      let errorMessage = (error as Error).message;
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error && parsed.error.message) {
          errorMessage = parsed.error.message;
        }
      } catch (e) {
        // Not JSON, ignore
      }
      // setAlertDialog({ isOpen: true, title: 'Generation Failed', message: "Failed to generate landing page: " + errorMessage });
      setGenerationError("Failed to generate landing page: " + errorMessage);
      // setAlertDialog({ isOpen: true, title: 'Generation Failed', message: "Failed to generate landing page" });
    } finally {
      if (currentId === generateIdRef.current) {
        setIsGenerating(false);
        setStreamingCode('');
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileBase64(null);
  };

  const handleAttachHtml = (htmlText: string) => {
    const htmlWithIds = addUniqueIds(htmlText);
    setGeneratedHtml(injectBridgeScript(htmlWithIds));
    setActiveTab('preview');
    // setShowGuide(true);
  };

  const handleDownloadCode = () => {
    if (!generatedHtml) return;

    // Clean up the bridge script for final export using unique markers
    const finalHtml = generatedHtml.replace(/<!-- AI_EDIT_BRIDGE_START -->[\s\S]*?<!-- AI_EDIT_BRIDGE_END -->/, '');

    const blob = new Blob([finalHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'landing-page.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Guide popup for editing elements
  const renderGuidePopup = () => (
    showGuide && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl p-6 flex flex-col items-center max-w-md w-full animate-in fade-in zoom-in">
          <button
            type="button"
            className={cn(
              'absolute top-3 right-3 text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded transition-colors',
              theme === 'dark'
                ? 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                : 'text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900'
            )}
            onClick={() => setShowGuide(false)}
            aria-label="Close guide"
          >
            Close
          </button>
          <h2 className={cn('text-lg font-bold mb-2 text-center', theme === 'dark' ? 'text-white' : 'text-neutral-900')}>How to Edit Elements</h2>
          <p className={cn('text-sm mb-4 text-center', theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700')}>After generating, simply <span className="font-semibold text-indigo-600 dark:text-indigo-400">hover</span> over any editable element in the preview. A highlight and edit icon will appear. Click to edit directly!</p>
          <div className="w-72 h-44 flex items-center justify-center rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 mb-2">
            {/* Replace the src below with your actual GIF guide */}
            <img src="/guide-edit-element.gif" alt="Edit element guide" className="object-contain w-full h-full" />
          </div>
        </div>
      </div>
    )
  );



  // API Key Settings Drawer
  const renderSettingsDrawer = () => {


    return (
      <Drawer
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        direction={isMobile ? "bottom" : "right"}
      >
        <DrawerContent className={cn(
          "bg-popover text-popover-foreground flex flex-col",
          theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900',
          isMobile ? "h-[85vh] rounded-t-2xl border-t" : "h-full w-96 rounded-l-2xl border-l"
        )}>
          <DrawerHeader className="pb-4 shrink-0">
            <DrawerTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
              <Key className="w-5 h-5 text-indigo-500" />
              API Settings
            </DrawerTitle>
            <DrawerDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Configure your preferred AI Provider, Model, and API Credentials.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {/* Provider Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                AI Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['gemini', 'openai', 'anthropic'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProviderChange(p)}
                    className={cn(
                      "py-2 px-3 text-xs font-semibold rounded-xl border text-center capitalize transition-all",
                      provider === p
                        ? "border-indigo-500 bg-indigo-50/50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400"
                        : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={cn(
                  'w-full p-2.5 rounded-xl text-sm border focus:ring-2 focus:ring-indigo-500 outline-none transition-all capitalize',
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-800 text-white' : 'bg-slate-50 border-neutral-200 text-neutral-900'
                )}
              >
                {PROVIDER_MODELS[provider].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Inputs */}
            {provider === 'gemini' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  className={cn(
                    'w-full p-2.5 rounded-xl text-sm border focus:ring-2 focus:ring-indigo-500 outline-none transition-all',
                    theme === 'dark' ? 'bg-neutral-950 border-neutral-800 text-white' : 'bg-slate-50 border-neutral-200 text-neutral-900'
                  )}
                  placeholder="Enter Gemini API Key"
                />
              </div>
            )}

            {provider === 'openai' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                  className={cn(
                    'w-full p-2.5 rounded-xl text-sm border focus:ring-2 focus:ring-indigo-500 outline-none transition-all',
                    theme === 'dark' ? 'bg-neutral-955 border-neutral-800 text-white' : 'bg-slate-50 border-neutral-200 text-neutral-900'
                  )}
                  placeholder="Enter OpenAI API Key"
                />
              </div>
            )}

            {provider === 'anthropic' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={anthropicKeyInput}
                  onChange={(e) => setAnthropicKeyInput(e.target.value)}
                  className={cn(
                    'w-full p-2.5 rounded-xl text-sm border focus:ring-2 focus:ring-indigo-500 outline-none transition-all',
                    theme === 'dark' ? 'bg-neutral-955 border-neutral-800 text-white' : 'bg-slate-50 border-neutral-200 text-neutral-900'
                  )}
                  placeholder="Enter Anthropic API Key"
                />
              </div>
            )}

            {/* Model Capabilities Notice */}
            {provider !== 'gemini' && (
              <div className="text-xs p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-100/50 dark:border-amber-950/50 leading-relaxed">
                <strong>Notice:</strong> Document reference uploads (like PDF) are only supported natively on Gemini. For {provider}, only reference images (JPEG/PNG) will be included in the generation.
              </div>
            )}

            {/* Save Options */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Save Options
              </label>
              <div className="flex flex-col gap-3">
                <label className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800/40",
                  saveLocation === 'session'
                    ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/10"
                    : "border-neutral-200 dark:border-neutral-800"
                )}>
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={saveLocation === 'session'}
                    onChange={() => setSaveLocation('session')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Save on this session</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Erased when you refresh the page or close the tab.</span>
                  </div>
                </label>

                <label className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800/40",
                  saveLocation === 'local'
                    ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/10"
                    : "border-neutral-200 dark:border-neutral-800"
                )}>
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={saveLocation === 'local'}
                    onChange={() => setSaveLocation('local')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Save on local</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Persisted in browser LocalStorage. No need to re-enter.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100/50 dark:border-indigo-950/50">
              <Shield className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed font-medium">
                Your API credentials are saved strictly in your local browser sandbox and are never transmitted to any server or external site.
              </p>
            </div>
          </div>

          <DrawerFooter className="p-4 flex gap-2 shrink-0">
            <Button onClick={handleSaveApiKey} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 font-medium shadow-lg hover:shadow-indigo-500/20 transition-all">
              Save Settings
            </Button>
            <DrawerClose asChild>
              <Button variant="ghost" className="w-full h-11 rounded-xl">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  };

  return (
    <div className={cn(
      "flex flex-col h-screen font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900/50 transition-colors duration-500",
      themeStyles.root
    )}>
      {renderSettingsDrawer()}

      <Dialog open={alertDialog.isOpen} onOpenChange={(isOpen) => setAlertDialog(prev => ({ ...prev, isOpen }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{alertDialog.title}</DialogTitle>
            <DialogDescription className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words mt-4 text-sm text-neutral-600 dark:text-neutral-400">
              {alertDialog.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="default" onClick={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))}>
              Okay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>




      {/* Main Workspace */}
      <main id="workspace" className={cn("flex-1 flex overflow-hidden pt-0", themeStyles.surface)}>

        {/* Guide Popup (centered) */}
        {renderGuidePopup()}
        {/* Floating AiPrompt (bottom center) */}
        {generatedHtml && (
          <div className={cn(
            "absolute bottom-6 left-1/2 min-w-[700px] max-w-[700px] z-40 px-0 transition-all duration-500 ease-in-out",
            isPromptVisible ? "-translate-x-1/2 translate-y-0 opacity-100" : "-translate-x-1/2 translate-y-32 opacity-0 pointer-events-none"
          )}>
            <AiPrompt onSubmit={handleGenerate} isGenerating={isGenerating} hideHeadings={true} initialPrompt={prompt} onAbort={handleAbort} initialFile={file} onRemoveFile={handleRemoveFile} onAttachHtml={handleAttachHtml} errorMsg={generationError} onOpenSettings={() => setIsSettingsOpen(true)} provider={provider} onProviderChange={handleProviderChangeGlobal} model={selectedModel} onModelChange={handleModelChangeGlobal} />
          </div>
        )}

        {/* Edit Drawer */}
        <Drawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          direction={isMobile ? "bottom" : "right"}
          dismissible={true}
        >
          <DrawerContent className={cn(
            "bg-popover text-popover-foreground flex flex-col shadow-2xl border",
            theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900',
            isMobile
              ? "bottom-2 inset-x-2 h-[80vh] rounded-2xl"
              : "top-2 bottom-2 right-2 h-[calc(100vh-1rem)] w-80 rounded-2xl"
          )}>
            <DrawerHeader className="border-b pb-4 flex flex-row items-center justify-between shrink-0">
              <DrawerTitle className="text-base font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-500" />
                Edit Element
              </DrawerTitle>
              <Button variant="ghost" size="icon" onClick={() => setIsDrawerOpen(false)} className="rounded-full h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              {/* Text Content */}
              {selectedElement?.tagName !== 'IMG' && selectedElement?.tagName !== 'VIDEO' && (
                <div className="flex flex-col gap-2">
                  <label className={cn('text-xs font-semibold uppercase tracking-wider', themeStyles.textSubtle)}>Text Content</label>
                  <textarea
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    className={cn(
                      'w-full min-h-[100px] p-3 rounded-xl text-sm border focus:ring-2 focus:ring-indigo-500 outline-none transition-all',
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
                    )}
                  />
                </div>
              )}

              {/* Link Handling */}
              {selectedElement?.tagName === 'A' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className={cn('text-xs font-semibold uppercase tracking-wider', themeStyles.textSubtle)}>Link Type</label>
                    <select
                      value={editForm.hrefType || 'url'}
                      onChange={(e) => setEditForm({ ...editForm, hrefType: e.target.value })}
                      className={cn(
                        'w-full p-2 rounded-lg text-sm border outline-none',
                        theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
                      )}
                    >
                      <option value="url">External Link (URL)</option>
                      <option value="email">Email (mailto:)</option>
                      <option value="phone">Phone (tel:)</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={cn('text-xs font-semibold uppercase tracking-wider', themeStyles.textSubtle)}>
                      {editForm.hrefType === 'email' ? 'Email Address' : editForm.hrefType === 'phone' ? 'Phone Number' : editForm.hrefType === 'whatsapp' ? 'WhatsApp Number' : 'Destination URL'}
                    </label>
                    <input
                      type="text"
                      value={editForm.href}
                      onChange={(e) => setEditForm({ ...editForm, href: e.target.value })}
                      className={cn(
                        'w-full p-2 rounded-lg text-sm border outline-none',
                        theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
                      )}
                      placeholder={editForm.hrefType === 'url' ? 'https://...' : ''}
                    />
                  </div>
                </div>
              )}

              {/* Media Handling */}
              {(selectedElement?.tagName === 'IMG' || selectedElement?.tagName === 'VIDEO') && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className={cn('text-xs font-semibold uppercase tracking-wider', themeStyles.textSubtle)}>Media Source</label>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editForm.src}
                          onChange={(e) => setEditForm({ ...editForm, src: e.target.value })}
                          className={cn(
                            'flex-1 p-2 rounded-lg text-sm border outline-none',
                            theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
                          )}
                          placeholder="Enter URL (YouTube, Image link, etc.)"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="file"
                          accept={selectedElement.tagName === 'IMG' ? 'image/*' : 'video/*'}
                          onChange={(e) => handleMediaUpload(e, selectedElement.tagName === 'IMG' ? 'image' : 'video')}
                          className="hidden"
                          id="media-upload"
                        />
                        <label
                          htmlFor="media-upload"
                          className={cn(
                            'w-full py-3 px-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-500 transition-colors',
                            theme === 'dark' ? 'border-neutral-800 text-neutral-400' : 'border-neutral-200 text-neutral-500'
                          )}
                        >
                          {selectedElement.tagName === 'IMG' ? <ImageIcon className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                          <span className="text-xs font-medium">Upload from computer</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {selectedElement.tagName === 'VIDEO' && (
                    <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-neutral-500" />
                        <span className="text-sm font-medium">Loop Video</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editForm.loop}
                        onChange={(e) => setEditForm({ ...editForm, loop: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex flex-col gap-2 shrink-0">
              <Button
                onClick={handleUpdateElement}
                className={cn('w-full rounded-xl flex items-center justify-center gap-2', themeStyles.accentButton)}
              >
                <Check className="w-4 h-4" />
                Save Changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsDrawerOpen(false)}
                className="w-full rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </DrawerContent>
        </Drawer>

        {!generatedHtml && !isGenerating && (
          <div className="flex-1 flex items-center justify-center relative overflow-hidden p-6">
            {/* Background WebThreads animation */}
            <div className="absolute inset-0 z-0 opacity-40 dark:opacity-40 pointer-events-none">
              <WebThreads
                color1="#5227FF"
                color2="#FF9FFC"
                color3="#FFFFFF"
                speed={0.2}
                threadCount={6}
                frequency={5.0}
                spread={0.18}
                taper={1.0}
                position={0.5}
                fanMode="center"
                glow={0.02}
                falloff={0.6}
                thickness={1.1}
                brightness={0.6}
                opacity={1.0}
                mirror={true}
                shimmer={false}
                grain={true}
                grainIntensity={0.05}
                mouseInteraction={true}
                mouseStrength={0.3}
              />
            </div>

            <div className="w-full max-w-3xl z-20">
              <AiPrompt onSubmit={handleGenerate} isGenerating={isGenerating} initialPrompt={prompt} onAbort={handleAbort} initialFile={file} onRemoveFile={handleRemoveFile} onAttachHtml={handleAttachHtml} errorMsg={generationError} onOpenSettings={() => setIsSettingsOpen(true)} provider={provider} onProviderChange={handleProviderChangeGlobal} model={selectedModel} onModelChange={handleModelChangeGlobal} />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {(generatedHtml || isGenerating) && (
          <div id="preview-window" className={cn('flex-1 flex flex-col min-w-0 p-6 overscroll-contain overflow-hidden scroll-mt-20 transition-colors duration-500', themeStyles.panel)}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className={cn('flex-1 flex flex-col h-full backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden', themeStyles.card)}>
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', themeStyles.tabHeader)}>
                <TabsList className={cn('p-1 rounded-lg border transition-colors duration-300', themeStyles.tabBar)}>
                  <TabsTrigger value="preview" disabled={!generatedHtml && !isGenerating} className={cn('rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-neutral-800 data-active:shadow-sm transition-all', themeStyles.textMuted)}>
                    <Layout className="w-3.5 h-3.5 mr-2" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="code" disabled={!generatedHtml && !isGenerating} className={cn('rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-neutral-800 data-active:shadow-sm transition-all', themeStyles.textMuted)}>
                    <Code className="w-3.5 h-3.5 mr-2" />
                    Code
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAbort}
                      className="rounded-full text-xs font-medium h-8 px-4 flex items-center gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      <X className="w-3.5 h-3.5" />
                      Abort Generation
                    </Button>
                  )}

                  {generatedHtml && !isGenerating && (
                    <div className="flex gap-2">
                      <Button
                        variant={isPromptVisible ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setIsPromptVisible(!isPromptVisible)}
                        className="rounded-full text-xs font-medium h-8 px-4 flex items-center gap-2"
                      >
                        {isPromptVisible ? <IconChevronDown className="w-3.5 h-3.5" /> : <IconChevronUp className="w-3.5 h-3.5" />}
                        {isPromptVisible ? 'Hide Prompt' : 'Show Prompt'}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGeneratedHtml(null);
                          setPrompt('');
                          setFile(null);
                          setFileBase64(null);
                          setIsDrawerOpen(false);
                          setSelectedElement(null);
                          setEditForm({});
                        }}
                        className="rounded-full text-xs font-medium h-8 px-4 flex items-center gap-2"
                      >
                        <IconReload className="w-3.5 h-3.5" />
                        Reset & Start New
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleZipExport}
                        className="rounded-full text-xs font-medium h-8 px-4 flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export .zip
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadCode}
                        className="rounded-full text-xs font-medium h-8 px-4"
                      >
                        Export HTML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const win = window.open();
                          if (win && generatedHtml) {
                            // Clean up the bridge script for preview window as well
                            const finalHtml = generatedHtml.replace(/<!-- AI_EDIT_BRIDGE_START -->[\s\S]*?<!-- AI_EDIT_BRIDGE_END -->/, '');
                            win.document.write(finalHtml);
                            win.document.close();
                          }
                        }}
                        className="rounded-full text-xs font-medium h-8 px-4"
                      >
                        Preview
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className={cn('flex-1 relative h-full transition-colors duration-300', themeStyles.panel)}>
                {/* Generated Content */}
                {(generatedHtml || isGenerating) && (
                  <>
                    <TabsContent value="preview" className="absolute inset-0 m-0 p-0 h-full data-[state=inactive]:hidden border-none outline-none bg-white">
                      {isGenerating ? (
                        <div className="w-full h-full p-8 flex flex-col gap-6 bg-slate-50 dark:bg-neutral-900 animate-pulse overflow-hidden">
                          {/* Skeleton Navbar */}
                          <div className="h-14 w-full bg-slate-200 dark:bg-neutral-800/80 rounded-xl flex items-center justify-between px-6">
                            <div className="h-6 w-24 bg-slate-300 dark:bg-neutral-700/50 rounded-lg animate-pulse"></div>
                            <div className="flex gap-4">
                              <div className="h-6 w-16 bg-slate-300 dark:bg-neutral-700/50 rounded-lg animate-pulse"></div>
                              <div className="h-6 w-16 bg-slate-300 dark:bg-neutral-700/50 rounded-lg animate-pulse"></div>
                              <div className="h-8 w-20 bg-indigo-200 dark:bg-indigo-900/40 rounded-full animate-pulse"></div>
                            </div>
                          </div>

                          {/* Skeleton Hero */}
                          <div className="flex-1 flex flex-col md:flex-row gap-8 items-center justify-center py-12">
                            <div className="flex-1 flex flex-col gap-4 w-full">
                              <div className="h-4 w-28 bg-slate-300 dark:bg-neutral-700/50 rounded-lg animate-pulse"></div>
                              <div className="h-12 w-full max-w-lg bg-slate-300 dark:bg-neutral-700/50 rounded-xl animate-pulse"></div>
                              <div className="h-12 w-4/5 max-w-md bg-slate-300 dark:bg-neutral-700/50 rounded-xl animate-pulse"></div>
                              <div className="h-6 w-full max-w-sm bg-slate-200 dark:bg-neutral-800/50 rounded-lg mt-2 animate-pulse"></div>
                              <div className="flex gap-4 mt-4">
                                <div className="h-11 w-32 bg-indigo-600/20 dark:bg-indigo-600/10 rounded-full animate-pulse"></div>
                                <div className="h-11 w-32 bg-slate-200 dark:bg-neutral-800/80 rounded-full animate-pulse"></div>
                              </div>
                            </div>
                            <div className="flex-1 w-full aspect-video md:aspect-square bg-slate-200 dark:bg-neutral-800/80 rounded-2xl flex items-center justify-center animate-pulse">
                              <svg className="w-12 h-12 text-slate-300 dark:text-neutral-700 animate-spin" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <iframe
                          ref={iframeRef}
                          title="landing page preview"
                          srcDoc={generatedHtml || ''}
                          className={cn('w-full h-full border-none', themeStyles.iframe)}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="code" className="absolute inset-0 m-0 p-0 h-full data-[state=inactive]:hidden border-none outline-none bg-[#0d1117] text-[#c9d1d9] font-mono text-[13px] leading-relaxed">
                      <div className="w-full h-full overflow-auto p-6 flex flex-col">
                        <pre className="flex-1 whitespace-pre-wrap break-all">
                          <code>{generatedHtml || ''}</code>
                        </pre>
                      </div>
                    </TabsContent>
                  </>
                )}
              </div>
            </Tabs>
          </div>
        )}
      </main>

      {/* Floating Theme Switcher (bottom right) */}
      {/* if generated html or preview mode, hide this */}
      {!generatedHtml && !isGenerating && (
        <div className="fixed bottom-6 right-6 z-50">
          <Tabs value={themeMode} onValueChange={(val) => setThemeMode(val as 'light' | 'dark' | 'system')} className="w-auto">
            <TabsList className="h-8 p-0.5 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border rounded-lg shadow-md">
              <TabsTrigger value="light" className="h-7 text-[11px] px-2.5 gap-1.5 rounded-md data-active:bg-white dark:data-active:bg-neutral-800 data-active:shadow-sm">
                <Sun className="w-3.5 h-3.5 text-orange-500" />
                Light
              </TabsTrigger>
              <TabsTrigger value="dark" className="h-7 text-[11px] px-2.5 gap-1.5 rounded-md data-active:bg-white dark:data-active:bg-neutral-800 data-active:shadow-sm">
                <Moon className="w-3.5 h-3.5 text-blue-500" />
                Dark
              </TabsTrigger>
              <TabsTrigger value="system" className="h-7 text-[11px] px-2.5 gap-1.5 rounded-md data-active:bg-white dark:data-active:bg-neutral-800 data-active:shadow-sm">
                <Laptop className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                System
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );
}
