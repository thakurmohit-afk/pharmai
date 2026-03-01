import sys

path = r'c:\Users\Samsepi0l\Desktop\Hackfusia\HF26\frontend_v2\client\components\chat\ChatArea.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

idx_start = content.find('            {/* ─── Live captions — Redesigned to be cinematic/native subtitles ─── */}')
if idx_start == -1:
    print('Start not found!')
    sys.exit(1)

idx_end = content.find('                    {/* Header */}')
if idx_end == -1:
    print('End not found!')
    sys.exit(1)

rest_of_file = content[idx_end:]

unescaped_lines = []
for line in rest_of_file.split('\n'):
    if line.startswith('              '):
        unescaped_lines.append(line[14:])
    else:
        unescaped_lines.append(line)

rest_of_file_clean = '\n'.join(unescaped_lines)

middle_clean = """            {/* ─── Live captions — Redesigned to be cinematic/native subtitles ─── */}
            <AnimatePresence>
              {voiceAgent.currentCaption && (
                <motion.div
                  key={voiceAgent.currentCaption.source + voiceAgent.currentCaption.text.slice(0, 20)}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={cn(
                    "absolute z-[105] inset-x-4 flex justify-center pointer-events-none",
                    hasCard ? "bottom-8" : "bottom-20"
                  )}
                >
                  <div className={cn(
                    "text-center w-full max-w-xl text-lg md:text-xl font-medium tracking-tight leading-snug drop-shadow-md",
                    voiceAgent.currentCaption.source === "user"
                      ? (theme === "dark" ? "text-emerald-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]" : "text-emerald-700 drop-shadow-[0_2px_6px_rgba(255,255,255,0.8)]")
                      : (theme === "dark" ? "text-slate-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" : "text-slate-800 drop-shadow-[0_2px_6px_rgba(255,255,255,0.8)]")
                  )}>
                    {voiceAgent.currentCaption.text}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Error state with retry ─── */}
            <AnimatePresence>
              {voiceAgent.error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-[105] bottom-32 left-1/2 -translate-x-1/2 max-w-sm w-[90%]"
                >
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl backdrop-blur-xl text-sm",
                    theme === "dark"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400"
                      : "bg-red-50 border border-red-100 text-red-600"
                  )}>
                    <span className="flex-1">{voiceAgent.error}</span>
                    <button
                      onClick={async () => {
                        const tid = await ensureThread();
                        if (tid) voiceAgent.startSession();
                      }}
                      className={cn(
                        "text-xs font-medium underline underline-offset-2 shrink-0",
                        theme === "dark" ? "text-red-300 hover:text-red-200" : "text-red-500 hover:text-red-700"
                      )}
                    >
                      Retry
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

"""

new_content = content[:idx_start] + middle_clean + rest_of_file_clean

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Success!')
