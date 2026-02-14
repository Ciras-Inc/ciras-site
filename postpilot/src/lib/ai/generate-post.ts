import Anthropic from '@anthropic-ai/sdk';
import type { GenerationRules, RuleTemplate, StyleAnalysis, Post } from '@/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface GeneratePostInput {
  topic: string;
  template: RuleTemplate;
  rules: GenerationRules;
  styleAnalysis?: StyleAnalysis | null;
  recentPosts?: Pick<Post, 'content_x' | 'status' | 'rejection_feedback'>[];
}

export async function generatePost(input: GeneratePostInput): Promise<{
  x: string;
  threads: string;
}> {
  const { topic, template, rules, styleAnalysis, recentPosts } = input;

  let systemPrompt = template.system_prompt + '\n\n';

  systemPrompt += `【X用】${rules.x_min_chars}〜${rules.x_max_chars}文字\n`;
  systemPrompt += `【Threads用】${rules.threads_min_chars}〜${rules.threads_max_chars}文字\n`;
  systemPrompt += `【ハッシュタグ】${rules.hashtag_min}〜${rules.hashtag_max}個\n`;

  if (rules.fixed_hashtags?.length) {
    systemPrompt += `【固定ハッシュタグ】${rules.fixed_hashtags.join(' ')}\n`;
  }
  systemPrompt += `【絵文字】${rules.emoji_usage}\n`;

  if (rules.prohibited_words?.length) {
    systemPrompt += `【NGワード】${rules.prohibited_words.join(', ')}\n`;
  }
  if (rules.prohibited_topics?.length) {
    systemPrompt += `【NGトピック】${rules.prohibited_topics.join(', ')}\n`;
  }
  if (rules.custom_rules) {
    systemPrompt += `【カスタムルール】\n${rules.custom_rules}\n`;
  }

  if (styleAnalysis) {
    systemPrompt += `\n【文体プロファイル】\n`;
    systemPrompt += `トーン: ${styleAnalysis.tone}\n`;
    systemPrompt += `文末: ${styleAnalysis.sentence_endings.join(', ')}\n`;
    systemPrompt += `改行スタイル: ${styleAnalysis.line_break_style}\n`;
    systemPrompt += `フック: ${styleAnalysis.hooks.join(', ')}\n`;
    systemPrompt += `概要: ${styleAnalysis.summary}\n`;
  }

  if (recentPosts?.length) {
    const rejected = recentPosts.filter(p => p.status === 'rejected' && p.rejection_feedback);
    if (rejected.length > 0) {
      systemPrompt += `\n【過去のNG理由（同様の投稿を避けてください）】\n`;
      rejected.slice(0, 3).forEach(p => {
        systemPrompt += `- 投稿: "${p.content_x?.slice(0, 50)}..." → NG理由: ${p.rejection_feedback}\n`;
      });
    }
  }

  systemPrompt += `\n必ず以下のJSON形式だけを返してください（説明不要）：\n{"x": "X用の投稿文", "threads": "Threads用の投稿文"}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `以下のテーマで投稿文を作成してください：\n${topic}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response is not valid JSON');
  }
  return JSON.parse(jsonMatch[0]);
}
