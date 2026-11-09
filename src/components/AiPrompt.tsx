import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  IconArrowRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCheck,
  IconChevronDown,
  IconCirclePlus,
  IconFileText,
  IconLoader2,
  IconPaperclip,
  IconPlus,
  IconSettings,
  IconSparkles,
  IconX
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { PROVIDER_MODELS } from '../App';
import RotatingText from './RotatingText';

interface AttachedFile {
  id: string;
  name: string;
  file: File;
  preview?: string;
}

const ACTIONS = [
  // { id: 'clone-screenshot', icon: IconCamera, label: 'Clone a Screenshot' },
  // { id: 'import-figma', icon: IconBrandFigma, label: 'Import from Figma' },
  // { id: 'upload-project', icon: IconFileUpload, label: 'Upload a Project' },
  // { id: 'landing-page', icon: IconLayoutDashboard, label: 'Landing Page' },
];

export function AiPrompt({
  onSubmit,
  isGenerating = false,
  hideHeadings = false,
  initialPrompt = '',
  onAbort,
  initialFile,
  onRemoveFile,
  onAttachHtml,
  errorMsg,
  onOpenSettings,
  provider = 'gemini',
  onProviderChange,
  model,
  onModelChange,
}: {
  onSubmit?: (prompt: string, file?: File) => void;
  isGenerating?: boolean;
  hideHeadings?: boolean;
  initialPrompt?: string;
  onAbort?: () => void;
  initialFile?: File | null;
  onRemoveFile?: () => void;
  onAttachHtml?: (html: string) => void;
  errorMsg?: string | null;
  onOpenSettings?: () => void;
  provider?: 'gemini' | 'openai' | 'anthropic';
  onProviderChange?: (provider: 'gemini' | 'openai' | 'anthropic') => void;
  model?: string;
  onModelChange?: (model: string, provider: 'gemini' | 'openai' | 'anthropic') => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [apiKeyWarning, setApiKeyWarning] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>(() => {
    if (initialFile) {
      return [{
        id: 'initial',
        name: initialFile.name,
        file: initialFile,
        preview: initialFile.type.startsWith('image/') ? URL.createObjectURL(initialFile) : undefined
      }];
    }
    return [];
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);

  const getActiveProviders = () => {
    const geminiKey = sessionStorage.getItem('gemini_api_key') || localStorage.getItem('gemini_api_key');
    const openaiKey = sessionStorage.getItem('openai_api_key') || localStorage.getItem('openai_api_key');
    const anthropicKey = sessionStorage.getItem('anthropic_api_key') || localStorage.getItem('anthropic_api_key');

    const active: ('gemini' | 'openai' | 'anthropic')[] = [];
    if (geminiKey) active.push('gemini');
    if (openaiKey) active.push('openai');
    if (anthropicKey) active.push('anthropic');

    return active;
  };
  const activeProviders = getActiveProviders();

  useEffect(() => {
    if (initialFile) {
      const isAlreadyAttached = attachedFiles.some((f) => f.file === initialFile);
      if (!isAlreadyAttached) {
        setAttachedFiles([{
          id: 'initial',
          name: initialFile.name,
          file: initialFile,
          preview: initialFile.type.startsWith('image/') ? URL.createObjectURL(initialFile) : undefined
        }]);
      }
    } else {
      setAttachedFiles([]);
    }
  }, [initialFile]);

  const [settings, setSettings] = useState({
    // autoComplete: true,
    // streaming: false,
    // showHistory: false,
  });

  const generateFileId = () => Math.random().toString(36).substring(7);
  const processFiles = (files: File[]) => {
    // Only process the first file as the original app only supported 1 file
    const file = files[0];
    if (!file) return;

    const fileId = generateFileId();
    const attachedFile: AttachedFile = {
      id: fileId,
      name: file.name,
      file,
    };

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, preview: reader.result as string } : f
          )
        );
      };
      reader.readAsDataURL(file);
    }

    // Replace the previous files to only allow one for now
    setAttachedFiles([attachedFile]);
  };

  const submitPrompt = () => {
    if (isGenerating) return;

    const activeProvider = sessionStorage.getItem('ai_provider') || localStorage.getItem('ai_provider') || 'gemini';
    const activeApiKey = sessionStorage.getItem(`${activeProvider}_api_key`) || localStorage.getItem(`${activeProvider}_api_key`) || '';
    if (!activeApiKey) {
      setApiKeyWarning(`Please configure your API key in settings.`);
      return;
    }
    setApiKeyWarning(null);

    if (prompt.trim() || attachedFiles.length > 0) {
      if (onSubmit) {
        onSubmit(prompt.trim(), attachedFiles[0]?.file);
      }
    }
  };

  const updateSetting = (key: keyof typeof settings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitPrompt();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleHtmlFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const htmlText = reader.result as string;
      if (onAttachHtml) {
        onAttachHtml(htmlText);
      }
    };
    reader.readAsText(file);

    if (htmlFileInputRef.current) {
      htmlFileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.id !== fileId));
    if (onRemoveFile) {
      onRemoveFile();
    }
  };


  const handleAbort = () => {
    if (onAbort) {
      onAbort();
    }
    setPrompt('');
    setAttachedFiles([]);
  };


  return (
    <div className="mx-auto flex w-full flex-col gap-4">
      {!hideHeadings && (
        <>

          <h2 className="-my-5 text-balance pb-0 text-center text-muted-foreground text-xl">
            <Badge variant="secondary" className='pt-2 pb-2 pr-3 pl-3 backdrop-blur-md bg-white/60 dark:bg-neutral-900/60'>
              Landing Page Builder
            </Badge>
          </h2>
          <h1 className="text-balance text-pretty text-center font-heading font-semibold text-[29px] text-foreground tracking-tighter sm:text-[32px] md:text-[46px]">
            Prompt. Refine. Ship.
          </h1>
          <h2 className="-my-5 text-balance pb-0 text-center text-muted-foreground text-xl">
            Build real, working software just by describing it
          </h2>
          <div className="flex items-center justify-center gap-1.5 text-center text-sm sm:text-base mt-2">
            <span>Perfect for</span>
            <RotatingText
              texts={[
                'small business',
                'enterprise',
                'company profile',
                'personal portfolio',
                'SaaS product',
                'creative agency',
                'mobile app showcase',
                'event registration'
              ]}
              mainClassName="px-1.5 py-0.2 bg-black dark:bg-white text-white dark:text-indigo-900 font-medium rounded-md inline-flex items-center"
              staggerFrom="last"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-120%", opacity: 0 }}
              staggerDuration={0.02}
              splitLevelClassName="overflow-hidden pb-0.5"
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              rotationInterval={5200}
            />
          </div>
        </>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col content-center">
        <form
          className="relative overflow-visible rounded-xl border bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md p-2 transition-colors duration-200 focus-within:border-ring shadow-sm"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onSubmit={handleSubmit}
        >
          <Button
            aria-label="Expand prompt"
            className="absolute right-2 top-2 z-10 h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
            variant="ghost"
            size="icon"
          >
            {isExpanded ? <IconArrowsMinimize size={14} /> : <IconArrowsMaximize size={14} />}
          </Button>
          {attachedFiles.length > 0 && (
            <div className="relative mb-2 flex w-fit items-center gap-2 overflow-hidden">
              {attachedFiles.map((file) => (
                <Badge
                  className="group relative h-6 max-w-30 cursor-pointer overflow-hidden px-0 text-[13px] transition-colors hover:bg-accent"
                  key={file.id}
                  variant="outline"
                >
                  <span className="flex h-full items-center gap-1.5 overflow-hidden pl-1 font-normal">
                    <div className="relative flex h-4 min-w-4 items-center justify-center">
                      {file.preview ? (
                        <img
                          alt={file.name}
                          className="absolute inset-0 h-4 w-4 rounded border object-cover"
                          src={file.preview}
                        />
                      ) : (
                        <IconPaperclip className="opacity-60" size={12} />
                      )}
                    </div>
                    <span className="inline overflow-hidden truncate pr-1.5">
                      {file.name}
                    </span>
                  </span>
                  <button
                    className="absolute right-1 z-10 rounded-sm p-0.5 text-muted-foreground opacity-0 focus-visible:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background group-hover:opacity-100"
                    onClick={() => handleRemoveFile(file.id)}
                    type="button"
                  >
                    <IconX size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Textarea
            className={cn(
              "resize-none rounded-none border-none bg-transparent! p-0 pr-8 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 w-full transition-all duration-300",
              isExpanded ? "max-h-[800px] min-h-[500px]" : "max-h-32 min-h-12"
            )}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            value={prompt}
            rows={isExpanded ? 50 : 3}
          />

          {(apiKeyWarning || errorMsg) && (
            <div className="px-1 pb-2 text-xs text-red-500 dark:text-red-400 font-medium animate-in fade-in slide-in-from-top-1">
              {apiKeyWarning || errorMsg}
            </div>
          )}

          <div className="flex items-center gap-1 pt-2">
            <div className="flex items-end gap-0.5 sm:gap-1">
              <input
                className="sr-only"
                multiple
                onChange={handleFileSelect}
                ref={fileInputRef}
                type="file"
                disabled={isGenerating}
              />
              <input
                className="sr-only"
                accept=".html"
                onChange={handleHtmlFileSelect}
                ref={htmlFileInputRef}
                type="file"
                disabled={isGenerating}
              />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Add attachments"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={isGenerating}
                    />
                  }
                >
                  <IconPlus size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-w-xs rounded-2xl p-1.5"
                >
                  <DropdownMenuGroup className="space-y-1">
                    <DropdownMenuItem
                      className="rounded-md text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex items-center gap-2">
                        <IconPaperclip
                          className="text-muted-foreground"
                          size={16}
                        />
                        <span>Attach Files</span>
                      </div>
                    </DropdownMenuItem>
                    {/* <DropdownMenuItem className="rounded-md text-xs">
                      <div className="flex items-center gap-2">
                        <IconLink className="text-muted-foreground" size={16} />
                        <span>Import from URL</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md text-xs">
                      <div className="flex items-center gap-2">
                        <IconClipboard
                          className="text-muted-foreground"
                          size={16}
                        />
                        <span>Paste from Clipboard</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md text-xs">
                      <div className="flex items-center gap-2">
                        <IconTemplate
                          className="text-muted-foreground"
                          size={16}
                        />
                        <span>Use Template</span>
                      </div>
                    </DropdownMenuItem> */}
                    {/* Attach html */}
                    <DropdownMenuItem
                      className="rounded-md text-xs"
                      onClick={() => htmlFileInputRef.current?.click()}
                    >
                      <div className="flex items-center gap-2">
                        <IconFileText
                          className="text-muted-foreground"
                          size={16}
                        />
                        <span>Attach HTML</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Adjust settings"
                      variant="ghost"
                      size="icon"
                      className="rounded-md"
                      disabled={isGenerating}
                    />
                  }
                >
                  <IconAdjustmentsHorizontal size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-48 rounded-2xl p-3"
                >
                  <DropdownMenuGroup className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconSparkles
                          className="text-muted-foreground"
                          size={16}
                        />
                        <Label className="text-xs">Auto-complete</Label>
                      </div>
                      <Switch
                        checked={settings.autoComplete}
                        className="scale-75"
                        onCheckedChange={(value) =>
                          updateSetting('autoComplete', value)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconPlayerPlay
                          className="text-muted-foreground"
                          size={16}
                        />
                        <Label className="text-xs">Streaming</Label>
                      </div>
                      <Switch
                        checked={settings.streaming}
                        className="scale-75"
                        onCheckedChange={(value) =>
                          updateSetting('streaming', value)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconHistory
                          className="text-muted-foreground"
                          size={16}
                        />
                        <Label className="text-xs">Show History</Label>
                      </div>
                      <Switch
                        checked={settings.showHistory}
                        className="scale-75"
                        onCheckedChange={(value) =>
                          updateSetting('showHistory', value)
                        }
                      />
                    </div>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu> */}
            </div>

            <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
              {activeProviders.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md gap-1.5 h-8 text-xs font-medium border-dashed text-muted-foreground hover:text-foreground"
                        disabled={isGenerating}
                      />
                    }
                  >
                    <IconSparkles size={14} />
                    <span className="hidden sm:inline-block">
                      {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Gemini'}
                    </span>
                    <IconChevronDown size={14} className="opacity-50 hidden sm:inline-block" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-xl">
                    <DropdownMenuGroup>
                      {activeProviders.map((prov) => (
                        <DropdownMenuSub key={prov}>
                          <DropdownMenuSubTrigger className="text-xs cursor-pointer">
                            {prov === 'openai' ? 'OpenAI' : prov === 'anthropic' ? 'Anthropic' : 'Gemini'}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent className="w-56 max-h-72 overflow-y-auto rounded-xl">
                              {PROVIDER_MODELS[prov].map((m) => (
                                <DropdownMenuItem
                                  key={m.value}
                                  onClick={() => onModelChange?.(m.value, prov)}
                                  className={cn("text-xs flex items-center justify-between cursor-pointer", model === m.value && "bg-accent text-accent-foreground")}
                                >
                                  <span>{m.label.split(' (')[0]}</span>
                                  {model === m.value && <IconCheck size={14} className="opacity-70" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Dropdown select model */}
              {onOpenSettings && (
                <Button
                  aria-label="Settings"
                  className="rounded-md"
                  onClick={onOpenSettings}
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isGenerating}
                >
                  <IconSettings size={16} />
                </Button>
              )}

              {isGenerating && (
                <Button
                  aria-label="Abort"
                  className="rounded-md"
                  onClick={handleAbort}
                  variant="outline"
                >
                  <IconX size={16} />
                  <span className="hidden sm:block">Abort</span>
                </Button>
              )}
              {/* <Button
                aria-label="Send message"
                className="rounded-md"
                disabled={isGenerating || (!prompt.trim() && attachedFiles.length === 0)}
                size="icon"
                type="submit"
                variant="default"
              >
                {isGenerating ? (
                  <IconLoader2 className="animate-spin" size={16} />
                ) : (
                  <IconArrowUp size={16} />
                )}
              </Button> */}
              <Button
                aria-label="Generate Page"
                className="rounded-md"
                disabled={isGenerating || (!prompt.trim() && attachedFiles.length === 0)}
                type="submit"
                variant="default"
              >
                <span className="hidden sm:block">Generate Page</span>

                {isGenerating ? (
                  <IconLoader2 className="animate-spin" size={16} />
                ) : (
                  <IconArrowRight size={16} />
                )}

              </Button>
            </div>
          </div>

          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border border-border border-dashed bg-muted text-foreground text-sm transition-opacity duration-200',
              isDragOver ? 'opacity-100' : 'opacity-0'
            )}
          >
            <span className="flex w-full items-center justify-center gap-1 font-medium">
              <IconCirclePlus className="min-w-4" size={16} />
              Drop files here to add as attachments
            </span>
          </div>
        </form>
      </div>

      <div className="mx-auto flex min-h-0 max-w-250 shrink-0 flex-wrap items-center justify-center gap-3">
        {ACTIONS.map((action) => (
          <Button
            className="gap-2 rounded-full"
            key={action.id}
            size="sm"
            variant="outline"
          >
            <action.icon size={16} />
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
