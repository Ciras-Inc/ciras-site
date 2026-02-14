import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function processFileInput(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<string> {
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  ) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      return XLSX.utils.sheet_to_csv(sheet);
    });
    return sheets.join('\n\n');
  }

  // CSV, TXT
  return buffer.toString('utf-8');
}

export async function processUrlInput(url: string): Promise<string> {
  const res = await fetch(url);
  const html = await res.text();

  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, aside, iframe, noscript').remove();

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text.slice(0, 5000);
}

export async function extractKeyPoints(text: string): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'テキストから3〜5個のキーポイントを抽出してください。JSON配列のみを返してください。例: ["ポイント1", "ポイント2", "ポイント3"]',
    messages: [
      {
        role: 'user',
        content: text.slice(0, 3000),
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [text.slice(0, 200)];
  return JSON.parse(jsonMatch[0]);
}
