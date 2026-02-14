import Anthropic from '@anthropic-ai/sdk';
import type { StyleAnalysis } from '@/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeStyle(samplePosts: string[]): Promise<StyleAnalysis> {
  // Constraint 8: limit to 10 posts, 200 chars each
  const limited = samplePosts.slice(0, 10).map(p => p.slice(0, 200));

  const systemPrompt = `あなたはSNS投稿の文体分析の専門家です。
与えられたサンプル投稿を分析し、以下のJSON形式で文体プロファイルを返してください。
説明は不要です。JSONのみを返してください。

{
  "tone": "全体的なトーン（例：プロフェッショナル、カジュアル）",
  "sentence_endings": ["よく使われる文末表現"],
  "avg_length": 数値（平均文字数）,
  "line_break_style": "改行の使い方の傾向",
  "emoji_usage": "絵文字の使用傾向",
  "hashtag_style": "ハッシュタグの使い方",
  "vocabulary_level": "語彙レベル",
  "recurring_themes": ["繰り返し現れるテーマ"],
  "hooks": ["よく使われる冒頭パターン"],
  "cta_style": "CTAの傾向",
  "personality_traits": ["文章から読み取れる人物像"],
  "avoid_patterns": ["避けるべきパターン"],
  "summary": "この人の文体を一言で表すと"
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `以下のサンプル投稿を分析してください：\n\n${limited.map((p, i) => `${i + 1}. ${p}`).join('\n\n')}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI style analysis response is not valid JSON');
  }
  return JSON.parse(jsonMatch[0]);
}
