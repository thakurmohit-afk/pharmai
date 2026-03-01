import sys

path = r'c:\Users\Samsepi0l\Desktop\Hackfusia\HF26\frontend_v2\client\pages\ChatPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''  const handleVoiceRichUpdate = useCallback((richData: Partial<Message>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          const updated: Message = {
            ...prev[i],
            action: richData.action || prev[i].action,
            quote: richData.quote || prev[i].quote,
            payment: richData.payment || prev[i].payment,
            recommendations: richData.recommendations || prev[i].recommendations,
          };
          return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  }, []);'''

replacement = '''  const handleVoiceRichUpdate = useCallback((richData: Partial<Message>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      
      const lastMsg = prev[prev.length - 1];

      // CRITICAL FIX: If backend Redis polling is faster than ElevenLabs audio stream,
      // create a "Ghost Bubble" so the Card payload doesn't erroneously attach 
      // to the PREVIOUS message natively. ElevenLabs text will seamlessly merge into this!
      if (lastMsg && lastMsg.role === "user") {
          return [
              ...prev,
              {
                  id: `ai-ghost-${Date.now()}`,
                  role: "assistant",
                  content: "",
                  isNew: true,
                  action: richData.action,
                  quote: richData.quote,
                  payment: richData.payment,
                  recommendations: richData.recommendations
              }
          ];
      }

      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          const updated: Message = {
            ...prev[i],
            action: richData.action || prev[i].action,
            quote: richData.quote || prev[i].quote,
            payment: richData.payment || prev[i].payment,
            recommendations: richData.recommendations || prev[i].recommendations,
          };
          return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  }, []);'''

if target not in content:
    print('Target code block not found in ChatPage.tsx!')
    sys.exit(1)

new_content = content.replace(target, replacement)
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Success.')
