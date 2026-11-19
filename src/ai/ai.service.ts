/**
 * BloomPath AI Service
 * Powered by Cloudflare Workers AI.
 * Model: @cf/meta/llama-3.1-8b-instruct (fast, capable, free on Workers AI)
 * Swap the MODEL constant to use any other text-generation model in the catalog.
 */

const MODEL = '@cf/meta/llama-3.1-8b-instruct' as const

const BLOOMPATH_SYSTEM_PROMPT = `You are BloomPath AI, a helpful and empathetic personal growth assistant.
BloomPath is a wellness and personal development app. Your role is to:
- Support users on their personal growth journeys
- Offer evidence-based advice on wellbeing, mindfulness, habits, and goal-setting
- Be warm, encouraging, and non-judgmental
- Keep responses concise (under 200 words unless the user asks for more detail)
- Never provide medical, legal, or financial advice — recommend professionals when appropriate

Always be honest if you don't know something.`

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiChatResult {
  message: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class AiService {
  constructor(private ai: Ai) {}

  /**
   * Single-turn chat — no history needed.
   */
  async chat(userMessage: string): Promise<AiChatResult> {
    const response = await this.ai.run(MODEL, {
      messages: [
        { role: 'system', content: BLOOMPATH_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    return {
      message: (response as any).response ?? '',
    }
  }

  /**
   * Multi-turn chat — pass conversation history for context.
   * History should be ordered oldest → newest, not including the latest user message.
   */
  async chatWithHistory(
    userMessage: string,
    history: ChatMessage[] = [],
  ): Promise<AiChatResult> {
    // Keep history to last 10 exchanges (20 messages) to stay within context limits
    const trimmedHistory = history.slice(-20)

    const messages: ChatMessage[] = [
      { role: 'system', content: BLOOMPATH_SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: 'user', content: userMessage },
    ]

    const response = await this.ai.run(MODEL, { messages })

    return {
      message: (response as any).response ?? '',
    }
  }

  /**
   * Generate a personalized daily affirmation or reflection prompt.
   */
  async generateAffirmation(context?: string): Promise<string> {
    const userPrompt = context
      ? `Generate a single, personalized daily affirmation or reflection prompt for someone who is: ${context}. Return only the affirmation text, nothing else.`
      : `Generate a single uplifting daily affirmation for personal growth. Return only the affirmation text, nothing else.`

    const response = await this.ai.run(MODEL, {
      messages: [
        { role: 'system', content: BLOOMPATH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    return ((response as any).response ?? '').trim()
  }

  /**
   * Analyze a journal entry and return supportive feedback + suggested next steps.
   */
  async analyzeJournal(entry: string): Promise<AiChatResult> {
    const prompt = `A user shared this journal entry with you. Provide warm, supportive feedback and 2–3 concrete next steps for their personal growth journey. Journal entry: "${entry}"`

    const response = await this.ai.run(MODEL, {
      messages: [
        { role: 'system', content: BLOOMPATH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    })

    return { message: (response as any).response ?? '' }
  }
}
