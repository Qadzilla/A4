import { useState, useEffect } from 'react';
import { cn } from '@a4/ui';
import { motion } from 'framer-motion';

const TYPING_SPEED = 50;
const DELETING_SPEED = 30;
const PAUSE_DURATION = 2800;

// Each pair is one persona's two-beat story: a professional "do this for me"
// project, then the same persona's plain-English question. The rotation walks
// pairs in order (project → analysis → next pair), so both halves always show.
const promptPairs = [
  {
    project: 'Build a budget from my last six months of bank statements',
    analysis: 'What did I actually spend on food delivery this year?',
  },
  {
    project: "Create a P&L from this quarter's invoices and expenses",
    analysis: 'Which of my clients still owes me money?',
  },
  {
    project: 'Project our runway if we hire two engineers in October',
    analysis: 'If revenue grows 8% a month, when do we break even?',
  },
  {
    project: 'Track my portfolio across all three of my brokerage accounts',
    analysis: 'Am I too concentrated in tech right now?',
  },
  {
    project: "Find every subscription I'm still paying for",
    analysis: 'Can I afford a $2,100/month apartment on my income?',
  },
  {
    project: "Turn this year's receipts into an itemized deduction list",
    analysis: 'Roughly what will I owe in taxes next April?',
  },
];

type ChatMode = 'project' | 'quick';

export function HeroChatInput() {
  const [mode, setMode] = useState<ChatMode>('project');
  const [text, setText] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // Just for visual effect

  const pair = promptPairs[promptIndex % promptPairs.length];

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const currentPrompt = (mode === 'project' ? pair?.project : pair?.analysis) ?? '';

    if (isDeleting) {
      if (text.length > 0) {
        timeout = setTimeout(() => {
          setText(currentPrompt.substring(0, text.length - 1));
        }, DELETING_SPEED);
      } else {
        // Done deleting — project → analysis within the pair, then next pair
        if (mode === 'project') {
          setMode('quick');
        } else {
          setMode('project');
          setPromptIndex((prev) => prev + 1);
        }
        setIsDeleting(false);
      }
    } else {
      if (text.length < currentPrompt.length) {
        timeout = setTimeout(() => {
          setText(currentPrompt.substring(0, text.length + 1));
        }, TYPING_SPEED);
      } else {
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, PAUSE_DURATION);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, isDeleting, promptIndex, mode, pair]);

  return (
    <div
      className={cn(
        'w-full max-w-3xl transition-all duration-300 relative z-10 mx-auto mt-12 mb-8',
        isFocused ? 'scale-[1.02]' : 'scale-100'
      )}
    >
      <div
        className={cn(
          'bg-[#161616] border rounded-3xl overflow-hidden transition-all duration-300 shadow-2xl relative',
          isFocused
            ? 'border-primary/50 ring-2 ring-primary/10 shadow-primary/5'
            : 'border-white/10 hover:border-white/20'
        )}
      >
        {/* Animated cursor blip */}
        <div className="absolute top-6 left-6 pointer-events-none flex items-center z-20">
            <span className="text-lg font-medium text-white/90">
                {text}
            </span>
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="w-[2px] h-6 bg-primary ml-1 block"
            />
        </div>

        {/* Text Area (Disabled since it's just visual) */}
        <textarea
          disabled
          className="w-full bg-transparent px-6 pt-6 pb-2 min-h-[100px] resize-none outline-none text-lg text-transparent placeholder:text-transparent font-medium"
        />

        {/* Bottom Toolbar */}
        <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-white/5 bg-[#111111]/80 backdrop-blur-md">
          {/* Mode Toggle Pill */}
          <div className="relative flex bg-white/5 p-1 rounded-full border border-white/10 w-64">
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-primary/10 shadow-[0_0_6px_var(--color-primary)] ring-1 ring-primary/20 transition-all duration-300 ease-out"
              style={{
                left: mode === 'project' ? '4px' : '50%',
              }}
            />
            <button
              type="button"
              className={cn(
                'relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors duration-300 flex items-center justify-center gap-1.5',
                mode === 'project'
                  ? 'text-white'
                  : 'text-white/50 hover:text-white'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Project
            </button>
            <button
              type="button"
              className={cn(
                'relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors duration-300 flex items-center justify-center gap-1.5',
                mode === 'quick'
                  ? 'text-white'
                  : 'text-white/50 hover:text-white'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1-1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
              Analysis
            </button>
          </div>

          {/* Send Button */}
          <button
            type="button"
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm',
              text.length > 5
                ? 'bg-primary text-black hover:scale-105'
                : 'bg-white/10 text-white/30'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
